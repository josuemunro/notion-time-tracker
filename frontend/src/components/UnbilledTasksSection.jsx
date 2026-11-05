import React, { useState } from 'react';
import { formatHoursHuman } from '../utils/timeUtils';
import { CheckIcon } from '@heroicons/react/24/solid';
import BillingModal from './BillingModal';
import ProjectIcon from './ProjectIcon';
import EmptyState from './common/EmptyState';
import { computeBillTotals, formatNZD } from '../utils/billingUtils';
import { sendByLabel, timingReason, TONE_CLASSES } from '../utils/billingSchedule';

// Unbilled work as billing items from the server (project.billingItems): whole
// tasks, or one row per unbilled payment of a split fixed-price task. Each row
// says when it should be invoiced (services/billing on the server decides).
function UnbilledTasksSection({ project, onTasksBilled, onRefresh }) {
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [showBillingModal, setShowBillingModal] = useState(false);

  if (!project) return null;
  const items = project.billingItems || [];

  if (items.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Unbilled Tasks</h2>
        <EmptyState title="Nothing to bill for this project" hint="Billable work that hasn't been billed yet will appear here." />
      </div>
    );
  }

  const toggle = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const dueKeys = items.filter(i => i.state === 'due').map(i => i.key);
  const selectedItems = items.filter(i => selectedKeys.has(i.key));
  const totals = computeBillTotals(selectedItems, project.hourlyRate);

  const handleBillCompleted = async () => {
    setSelectedKeys(new Set());
    setShowBillingModal(false);
    if (onTasksBilled) await onTasksBilled();
    if (onRefresh) onRefresh();
  };

  return (
    <>
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2.5 mb-5">
          <ProjectIcon
            iconType={project.iconType}
            iconValue={project.iconValue}
            projectName={project.name}
            projectColor={project.color}
            className="w-6 h-6"
          />
          <h2 className="text-lg font-semibold text-gray-900">Unbilled Tasks</h2>
          {dueKeys.length > 0 && (
            <button
              onClick={() => setSelectedKeys(new Set(dueKeys))}
              className="ml-auto text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              Select due now ({dueKeys.length})
            </button>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Item List - 70% width on desktop */}
          <div className="lg:w-[70%]">
            <div className="space-y-3">
              {items.map(item => {
                const selected = selectedKeys.has(item.key);
                const badge = sendByLabel(item);
                return (
                  <div
                    key={item.key}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${selected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
                      }`}
                    onClick={() => toggle(item.key)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-6 h-6 flex-shrink-0 rounded-md border-2 flex items-center justify-center ${selected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                          {selected && <CheckIcon className="w-4 h-4 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-gray-800">
                              {item.name}
                              {item.label && <span className="font-normal text-gray-500"> — {item.label}</span>}
                            </h3>
                            {item.kind === 'installment' && (
                              <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                                Payment {item.paymentNumber}/{item.paymentCount}
                              </span>
                            )}
                            {item.kind === 'task' && item.fixedPrice != null && (
                              <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                                Fixed {formatNZD(item.fixedPrice)}
                              </span>
                            )}
                            {item.fixedPrice == null && item.hourlyRateOverride != null && (
                              <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                                @{formatNZD(item.hourlyRateOverride)}/hr
                              </span>
                            )}
                            {item.isManual && (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Local</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>Status: {item.status}</span>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[badge.tone]}`}
                              title={timingReason(item.timing, project.invoiceDayOfMonth)}
                            >
                              {badge.text}
                            </span>
                            {badge.detail && <span className="text-xs text-gray-500">{badge.detail}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold text-gray-800">
                          {item.kind === 'installment' ? formatNZD(item.amount) : formatHoursHuman(item.totalHoursSpent || 0)}
                        </p>
                        {item.kind === 'task' && <p className="text-sm text-gray-600">{formatNZD(item.amount)}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bill Preview - 30% width on desktop */}
          <div className="lg:w-[30%]">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 sticky top-4">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Bill Preview</h3>

              {selectedItems.length === 0 ? (
                <p className="text-gray-500 text-sm">Select items to preview the bill</p>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {selectedItems.map(item => (
                      <div key={item.key} className="flex justify-between text-sm">
                        <span className="truncate pr-2">{item.name}{item.label ? ` — ${item.label}` : ''}</span>
                        <span className="whitespace-nowrap">
                          {item.fixedPrice != null ? formatNZD(item.fixedPrice) : formatHoursHuman(item.totalHoursSpent || 0)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <hr className="border-gray-300" />

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Total Time:</span>
                      <span className="font-medium">{formatHoursHuman(totals.totalHours)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Billed Time:</span>
                      <span className="font-medium">{formatHoursHuman(totals.roundedHours)}</span>
                    </div>
                    {totals.fixedAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>Fixed-price items:</span>
                        <span className="font-medium">{formatNZD(totals.fixedAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span>Subtotal:</span>
                      <span className="font-medium">{formatNZD(totals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>GST (15%):</span>
                      <span className="font-medium">{formatNZD(totals.gst)}</span>
                    </div>
                    <hr className="border-gray-300" />
                    <div className="flex justify-between font-semibold">
                      <span>Total:</span>
                      <span>{formatNZD(totals.total)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowBillingModal(true)}
                    className="w-full mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    Create Bill
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showBillingModal && (
        <BillingModal
          project={project}
          items={selectedItems}
          onClose={() => setShowBillingModal(false)}
          onCompleted={handleBillCompleted}
        />
      )}
    </>
  );
}

export default UnbilledTasksSection;
