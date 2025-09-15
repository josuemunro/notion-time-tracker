import React, { useState, useEffect } from 'react';
import { useTimer } from '../contexts/TimerContext';
import { formatTimerDisplay } from '../utils/timeUtils';
import { FireIcon, BoltIcon, StarIcon, TrophyIcon } from '@heroicons/react/24/solid';

const DopamineTimer = () => {
  const { activeTimerDetails, elapsedTime, isRunning } = useTimer();
  const [streak, setStreak] = useState(() => {
    return parseInt(localStorage.getItem('timer-streak') || '0');
  });
  const [totalXP, setTotalXP] = useState(() => {
    return parseInt(localStorage.getItem('timer-xp') || '0');
  });
  const [level, setLevel] = useState(() => {
    return parseInt(localStorage.getItem('timer-level') || '1');
  });
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastSessionTime, setLastSessionTime] = useState(0);

  // Calculate level from XP (every 1000 XP = new level)
  const currentLevel = Math.floor(totalXP / 1000) + 1;
  const xpToNextLevel = 1000 - (totalXP % 1000);
  const xpProgress = (totalXP % 1000) / 1000 * 100;

  // Timer intensity based on elapsed time
  const getTimerIntensity = () => {
    if (elapsedTime < 300) return 'warming-up'; // First 5 minutes
    if (elapsedTime < 1800) return 'focused'; // First 30 minutes
    if (elapsedTime < 3600) return 'deep-flow'; // First hour
    return 'legendary'; // Beyond hour
  };

  // Color scheme based on intensity
  const getTimerColors = () => {
    const intensity = getTimerIntensity();
    switch (intensity) {
      case 'warming-up': return {
        bg: 'from-green-400 to-blue-500',
        ring: 'ring-green-500',
        text: 'text-green-700',
        icon: 'text-green-600'
      };
      case 'focused': return {
        bg: 'from-yellow-400 to-orange-500',
        ring: 'ring-yellow-500',
        text: 'text-yellow-700',
        icon: 'text-yellow-600'
      };
      case 'deep-flow': return {
        bg: 'from-orange-500 to-red-500',
        ring: 'ring-orange-500',
        text: 'text-orange-700',
        icon: 'text-orange-600'
      };
      case 'legendary': return {
        bg: 'from-purple-500 to-pink-500',
        ring: 'ring-purple-500',
        text: 'text-purple-700',
        icon: 'text-purple-600'
      };
      default: return {
        bg: 'from-gray-400 to-gray-500',
        ring: 'ring-gray-500',
        text: 'text-gray-700',
        icon: 'text-gray-600'
      };
    }
  };

  // Calculate XP earned based on session time
  const calculateXP = (sessionTime) => {
    const minutes = Math.floor(sessionTime / 60);
    let xp = 0;

    // Base XP: 1 point per minute
    xp += minutes;

    // Bonus XP for milestones
    if (minutes >= 15) xp += 10; // 15-minute bonus
    if (minutes >= 30) xp += 15; // 30-minute bonus
    if (minutes >= 60) xp += 25; // 1-hour bonus
    if (minutes >= 120) xp += 50; // 2-hour bonus (legendary!)

    return xp;
  };

  // Update streak and XP when timer stops
  useEffect(() => {
    if (!isRunning && lastSessionTime > 0 && elapsedTime === 0) {
      // Timer was stopped, calculate rewards
      const sessionTime = lastSessionTime;

      if (sessionTime >= 300) { // At least 5 minutes to count
        const earnedXP = calculateXP(sessionTime);
        const newTotalXP = totalXP + earnedXP;
        const newStreak = streak + 1;
        const newLevel = Math.floor(newTotalXP / 1000) + 1;

        setTotalXP(newTotalXP);
        setStreak(newStreak);

        // Level up celebration
        if (newLevel > level) {
          setLevel(newLevel);
          setShowCelebration(true);
          setTimeout(() => setShowCelebration(false), 3000);
        }

        // Save to localStorage
        localStorage.setItem('timer-xp', newTotalXP.toString());
        localStorage.setItem('timer-streak', newStreak.toString());
        localStorage.setItem('timer-level', newLevel.toString());
      }
    }

    if (isRunning && elapsedTime > 0) {
      setLastSessionTime(elapsedTime);
    }
  }, [isRunning, elapsedTime, totalXP, streak, level, lastSessionTime]);

  // Animated progress circle
  const CircularProgress = ({ progress, size = 200, strokeWidth = 8 }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            className="text-gray-200"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            className={getTimerColors().icon}
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.5s ease-in-out',
            }}
          />
        </svg>
      </div>
    );
  };

  // Timer intensity label
  const getIntensityLabel = () => {
    const intensity = getTimerIntensity();
    switch (intensity) {
      case 'warming-up': return { label: 'Warming Up', icon: <BoltIcon className="h-5 w-5" /> };
      case 'focused': return { label: 'Focused', icon: <StarIcon className="h-5 w-5" /> };
      case 'deep-flow': return { label: 'Deep Flow', icon: <FireIcon className="h-5 w-5" /> };
      case 'legendary': return { label: 'LEGENDARY!', icon: <TrophyIcon className="h-5 w-5" /> };
      default: return { label: 'Ready', icon: <BoltIcon className="h-5 w-5" /> };
    }
  };

  if (!isRunning || !activeTimerDetails) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-lg max-w-md mx-auto text-center">
        <div className="mb-4">
          <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-3">
            <BoltIcon className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Ready to Focus?</h3>
          <p className="text-sm text-gray-500">Start a task to begin earning XP!</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-xl font-bold text-blue-600">Lv.{level}</div>
            <div className="text-xs text-gray-500">Level</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-600">{totalXP}</div>
            <div className="text-xs text-gray-500">Total XP</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-orange-600">{streak}</div>
            <div className="text-xs text-gray-500">Streak</div>
          </div>
        </div>
      </div>
    );
  }

  const colors = getTimerColors();
  const intensity = getIntensityLabel();
  const minutes = Math.floor(elapsedTime / 60);
  const progressToNext = elapsedTime % 900; // Progress to next 15-minute mark
  const progress = (progressToNext / 900) * 100;

  return (
    <div className={`relative bg-gradient-to-br ${colors.bg} p-8 rounded-2xl shadow-2xl max-w-lg mx-auto text-white overflow-hidden`}>
      {/* Celebration overlay */}
      {showCelebration && (
        <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 opacity-90 flex items-center justify-center z-10 animate-pulse">
          <div className="text-center">
            <TrophyIcon className="h-16 w-16 mx-auto mb-2 text-white animate-bounce" />
            <div className="text-2xl font-bold">LEVEL UP!</div>
            <div className="text-lg">Level {level}</div>
          </div>
        </div>
      )}

      {/* Animated background effects */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-4 right-4 w-8 h-8 bg-white rounded-full animate-ping"></div>
        <div className="absolute bottom-6 left-6 w-4 h-4 bg-white rounded-full animate-pulse"></div>
        <div className="absolute top-1/3 left-4 w-6 h-6 bg-white rounded-full animate-bounce"></div>
      </div>

      {/* Header */}
      <div className="relative z-5 text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          {intensity.icon}
          <span className="text-lg font-bold">{intensity.label}</span>
          {getTimerIntensity() === 'legendary' && <FireIcon className="h-5 w-5 animate-bounce" />}
        </div>
        <h2 className="text-2xl font-bold mb-1">{activeTimerDetails.taskName}</h2>
        <p className="text-sm opacity-90">{activeTimerDetails.projectName}</p>
      </div>

      {/* Main Timer Display */}
      <div className="relative z-5 flex items-center justify-center mb-6">
        <div className="relative">
          <CircularProgress progress={progress} size={180} strokeWidth={12} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-3xl font-mono font-bold">{formatTimerDisplay(elapsedTime)}</div>
              <div className="text-sm opacity-80">{minutes} minutes</div>
            </div>
          </div>
        </div>
      </div>

      {/* Live XP Counter */}
      <div className="relative z-5 text-center mb-4">
        <div className="text-sm opacity-90 mb-1">Earning XP...</div>
        <div className="text-xl font-bold">+{calculateXP(elapsedTime)} XP</div>
      </div>

      {/* Stats Row */}
      <div className="relative z-5 grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-lg font-bold">Lv.{level}</div>
          <div className="text-xs opacity-80">Level</div>
          <div className="w-full bg-white bg-opacity-20 rounded-full h-1 mt-1">
            <div
              className="bg-white h-1 rounded-full transition-all duration-500"
              style={{ width: `${xpProgress}%` }}
            ></div>
          </div>
        </div>
        <div>
          <div className="text-lg font-bold">{streak}</div>
          <div className="text-xs opacity-80">Streak</div>
          <div className="flex justify-center mt-1">
            <FireIcon className="h-3 w-3" />
          </div>
        </div>
        <div>
          <div className="text-lg font-bold">{totalXP + calculateXP(elapsedTime)}</div>
          <div className="text-xs opacity-80">Total XP</div>
          <div className="text-xs opacity-60">{xpToNextLevel - calculateXP(elapsedTime)} to next</div>
        </div>
      </div>

      {/* Motivational messages */}
      {minutes >= 15 && minutes < 16 && (
        <div className="relative z-5 text-center mt-4 animate-bounce">
          <div className="text-sm font-bold">🎉 15 Minutes! Bonus XP!</div>
        </div>
      )}
      {minutes >= 30 && minutes < 31 && (
        <div className="relative z-5 text-center mt-4 animate-bounce">
          <div className="text-sm font-bold">🔥 30 Minutes! You're on fire!</div>
        </div>
      )}
      {minutes >= 60 && minutes < 61 && (
        <div className="relative z-5 text-center mt-4 animate-bounce">
          <div className="text-sm font-bold">🏆 1 HOUR! LEGENDARY!</div>
        </div>
      )}
    </div>
  );
};

export default DopamineTimer; 