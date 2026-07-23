import React, { useState, useEffect, useRef } from 'react';
import { useTimer } from '../contexts/TimerContext';
import { getTimeEntries } from '../services/api';
import { formatTimerDisplay, formatDurationHuman, getNZDateString } from '../utils/timeUtils';
import { entryEarnings, formatNZD } from '../utils/billingUtils';
import ProjectIcon from './ProjectIcon';

// ---------------------------------------------------------------------------
// Money-first timer. No XP, no streaks — the dopamine is real dollars:
//  - hourly tasks: session earnings tick UP (rate × elapsed)
//  - fixed-price tasks: live effective $/hr ticks DOWN (price / total task hours)
// Backed by an original WebGL aurora shader that intensifies the longer the
// session runs. Rendering fully stops when the tab is hidden (visibilitychange
// + rAF), and the canvas isn't mounted at all while idle.
// ---------------------------------------------------------------------------

const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_intensity;
uniform vec3 u_color;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * vec2(3.0, 2.0);
  float t = u_time * (0.06 + 0.18 * u_intensity);
  float q = fbm(p + vec2(t, -t * 0.6));
  float r = fbm(p + q * (1.0 + u_intensity) + vec2(t * 0.7, t * 0.3));
  float glow = smoothstep(0.15, 0.95, r);
  vec3 accent = u_color.gbr;
  vec3 col = mix(u_color * 0.12, u_color * (0.7 + 0.5 * u_intensity), glow);
  col += accent * pow(r, 3.0) * (0.3 + 0.9 * u_intensity);
  float vig = smoothstep(1.25, 0.35, distance(uv, vec2(0.5)));
  col *= mix(0.65, 1.0, vig);
  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const hexToRgb01 = (hex) => {
  const h = (hex || '#6366f1').replace('#', '');
  if (h.length !== 6) return [0.39, 0.4, 0.95];
  return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255);
};

// Rotate an rgb color's hue by `deg` degrees (for slow drift over long sessions)
const hueRotate = ([r, g, b], deg) => {
  const a = (deg * Math.PI) / 180;
  const cosA = Math.cos(a), sinA = Math.sin(a);
  const m = [
    0.213 + cosA * 0.787 - sinA * 0.213, 0.715 - cosA * 0.715 - sinA * 0.715, 0.072 - cosA * 0.072 + sinA * 0.928,
    0.213 - cosA * 0.213 + sinA * 0.143, 0.715 + cosA * 0.285 + sinA * 0.140, 0.072 - cosA * 0.072 - sinA * 0.283,
    0.213 - cosA * 0.213 - sinA * 0.787, 0.715 - cosA * 0.715 + sinA * 0.715, 0.072 + cosA * 0.928 + sinA * 0.072,
  ];
  return [
    Math.min(1, Math.max(0, r * m[0] + g * m[1] + b * m[2])),
    Math.min(1, Math.max(0, r * m[3] + g * m[4] + b * m[5])),
    Math.min(1, Math.max(0, r * m[6] + g * m[7] + b * m[8])),
  ];
};

function ShaderCanvas({ color, intensity }) {
  const canvasRef = useRef(null);
  // Live uniform values read inside the render loop without rebuilding GL state
  const liveRef = useRef({ color, intensity });
  liveRef.current = { color, intensity };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return; // no WebGL → the CSS gradient behind the canvas shows through

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uIntensity = gl.getUniformLocation(prog, 'u_intensity');
    const uColor = gl.getUniformLocation(prog, 'u_color');

    let raf = null;
    const start = performance.now();

    const frame = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.uniform1f(uIntensity, liveRef.current.intensity);
      gl.uniform3fv(uColor, liveRef.current.color);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    };

    // Fully stop rendering when the tab is hidden
    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
      } else if (!raf) {
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) raf = requestAnimationFrame(frame);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      // No explicit loseContext(): React StrictMode remounts reuse the same
      // canvas, and a deliberately-lost context can't be reacquired. The
      // context is released with the canvas element on unmount.
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

function MoneyTimer() {
  const {
    activeTimerDetails,
    elapsedTime,
    isRunning,
    registerTimerChangeCallback,
  } = useTimer();
  const [todayEntries, setTodayEntries] = useState([]);

  const fetchToday = async () => {
    try {
      const { data } = await getTimeEntries({ date: getNZDateString() });
      setTodayEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch today entries:', err);
    }
  };

  useEffect(() => {
    fetchToday();
    return registerTimerChangeCallback(fetchToday);
  }, [registerTimerChangeCallback]);

  const details = activeTimerDetails || {};
  const isFixed = details.fixedPrice != null;
  const rate = details.hourlyRateOverride != null ? details.hourlyRateOverride : (details.hourlyRate || 0);
  const sessionEarnings = !isFixed ? (elapsedTime / 3600) * rate : null;

  // Fixed-price: live effective rate = price / total hours across the task's life
  const totalTaskSeconds = (details.taskTotalSeconds || 0) + elapsedTime;
  const effectiveRate = isFixed && totalTaskSeconds >= 60
    ? details.fixedPrice / (totalTaskSeconds / 3600)
    : null;

  // Today = completed entries' earnings + the live hourly session
  const todayCompletedSeconds = todayEntries.reduce((s, e) => s + (e.duration || 0), 0);
  const todayEarnings = todayEntries.reduce((s, e) => s + entryEarnings(e), 0)
    + (isRunning && !isFixed ? sessionEarnings : 0);
  const todaySeconds = todayCompletedSeconds + (isRunning ? elapsedTime : 0);

  // Shader mood: ramps to full intensity over 2 hours; hue drifts 20°/hr
  const intensity = Math.min(1, elapsedTime / 7200);
  const color = hueRotate(hexToRgb01(details.projectColor), (elapsedTime / 3600) * 20);

  if (!isRunning) {
    return (
      <div className="relative max-w-lg mx-auto rounded-2xl overflow-hidden shadow-xl bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="relative z-10 p-8 flex flex-col items-center text-center">
          <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Ready to work</p>
          <p className="text-gray-500 text-sm mb-6">Start a task — watch the money come in.</p>
          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-bold text-emerald-400 tabular-nums">{formatNZD(todayEarnings)}</span>
          </div>
          <p className="text-gray-400 text-sm mt-1">
            earned today · {formatDurationHuman(todaySeconds)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative max-w-lg mx-auto rounded-2xl overflow-hidden shadow-2xl bg-gray-900" style={{ minHeight: '300px' }}>
      <ShaderCanvas color={color} intensity={intensity} />
      <div className="relative z-10 p-8 flex flex-col items-center text-center text-white">
        <div className="flex items-center space-x-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <ProjectIcon
            iconType={details.projectIconType}
            iconValue={details.projectIconValue}
            projectName={details.projectName}
            projectColor={details.projectColor}
            className="w-4 h-4"
          />
          <span className="text-sm opacity-80" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
            {details.projectName}
          </span>
        </div>
        <h2 className="text-xl font-semibold mb-4 drop-shadow" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>
          {details.taskName}
        </h2>

        <div className="text-6xl font-bold tabular-nums mb-4" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>
          {formatTimerDisplay(elapsedTime)}
        </div>

        {isFixed ? (
          <div className="mb-2">
            <div className="text-3xl font-bold text-emerald-300 tabular-nums" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>
              {effectiveRate != null ? `${formatNZD(effectiveRate)}/hr` : '—'}
            </div>
            <p className="text-sm opacity-80 mt-1" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
              effective rate · fixed price {formatNZD(details.fixedPrice)} · {formatDurationHuman(totalTaskSeconds)} on task
            </p>
          </div>
        ) : rate > 0 ? (
          <div className="mb-2">
            <div className="text-3xl font-bold text-emerald-300 tabular-nums" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>
              {formatNZD(sessionEarnings)}
            </div>
            <p className="text-sm opacity-80 mt-1" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
              this session @ {formatNZD(rate)}/hr
            </p>
          </div>
        ) : (
          <p className="text-sm opacity-70 mb-2" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
            Set an hourly rate on the project to see live earnings
          </p>
        )}

        <p className="text-sm opacity-75 border-t border-white/20 pt-3 mt-2 w-full" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
          Today: <span className="font-semibold text-emerald-200">{formatNZD(todayEarnings)}</span> · {formatDurationHuman(todaySeconds)}
        </p>
      </div>
    </div>
  );
}

export default MoneyTimer;
