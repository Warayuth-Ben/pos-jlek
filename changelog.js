// ─── Change Log System V2 ────────────────────────────────────────────

const CHANGELOG_KEY = "pos-jlek-changelog";

/**
 * Create a log entry
 */
function createLogEntry(action, billId, orderId, before, after) {
  return {
    timestamp: Date.now(),
    billId,
    orderId,
    action,
    before,
    after,
  };
}

/**
 * Save a log entry to localStorage
 */
function saveLogEntry(entry) {
  try {
    const logs = getLogs();
    logs.push(entry);
    localStorage.setItem(CHANGELOG_KEY, JSON.stringify(logs));
  } catch {
    // silently fail if localStorage is full or unavailable
  }
}

/**
 * Update an existing log entry (by timestamp)
 */
function updateLogEntry(timestamp, updates) {
  try {
    const logs = getLogs();
    const idx = logs.findIndex(l => l.timestamp === timestamp);
    if (idx !== -1) {
      logs[idx] = { ...logs[idx], ...updates };
      localStorage.setItem(CHANGELOG_KEY, JSON.stringify(logs));
    }
  } catch {
    // silently fail
  }
}

/**
 * Get all logs from localStorage
 */
function getLogs() {
  try {
    const raw = localStorage.getItem(CHANGELOG_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * Get logs for a specific bill, sorted chronologically (oldest first)
 */
function getLogsForBill(billId) {
  return getLogs()
    .filter((log) => log.billId === billId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Get logs filtered by order ID
 */
function getLogsForOrder(billId, orderId) {
  return getLogsForBill(billId)
    .filter((log) => log.orderId === orderId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Clear all logs (for reset/testing)
 */
function clearLogs() {
  localStorage.removeItem(CHANGELOG_KEY);
}

/**
 * Compute diff between two order states
 */
function computeOrderDiff(before, after) {
  if (!before || !after) return null;

  const diff = [];
  const beforeMap = new Map(
    (before.items || []).map((item) => [`${item.name}-${item.price}`, item])
  );
  const afterMap = new Map(
    (after.items || []).map((item) => [`${item.name}-${item.price}`, item])
  );

  // Check for changes and additions
  for (const [key, afterItem] of afterMap) {
    const beforeItem = beforeMap.get(key);
    if (!beforeItem) {
      // Added item
      diff.push({
        type: "added",
        name: afterItem.name,
        quantity: afterItem.quantity,
        price: afterItem.price,
      });
    } else if (beforeItem.quantity !== afterItem.quantity) {
      // Quantity changed
      diff.push({
        type: "changed",
        name: afterItem.name,
        oldQuantity: beforeItem.quantity,
        newQuantity: afterItem.quantity,
        price: afterItem.price,
      });
    }
    beforeMap.delete(key);
  }

  // Remaining items in beforeMap are removed
  for (const beforeItem of beforeMap.values()) {
    diff.push({
      type: "removed",
      name: beforeItem.name,
      quantity: beforeItem.quantity,
      price: beforeItem.price,
    });
  }

  return diff.length > 0 ? diff : null;
}

/**
 * Format log entry for display
 */
function formatLogEntry(entry) {
  const time = new Date(entry.timestamp);
  const timeStr = time.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = time.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

  let actionText = "";
  switch (entry.action) {
    case "create_order":
      actionText = "สร้างออเดอร์";
      break;
    case "confirm_order":
      actionText = "ยืนยันออเดอร์";
      break;
    case "enter_edit":
      actionText = "เริ่มแก้ไข";
      break;
    case "confirm_edit":
      actionText = "ยืนยันการแก้ไข";
      break;
    case "addon_order":
      actionText = "สร้างออเดอร์เพิ่ม";
      break;
    case "pay_bill":
      actionText = "คิดเงิน";
      break;
    case "cancel_bill":
      actionText = "ยกเลิกบิล";
      break;
    default:
      actionText = entry.action;
  }

  const orderLabel = entry.orderId
    ? `ออเดอร์ #${String(entry.orderId).padStart(2, "0")}`
    : "ทั้งบิล";

  let diffHtml = "";

  // For edit actions, show diff; for others, show summary
  if ((entry.action === "enter_edit" || entry.action === "confirm_edit") && entry.before && entry.after) {
    const diff = computeOrderDiff(entry.before, entry.after);
    if (diff && diff.length > 0) {
      diffHtml = `<div class="log-comparison">`;
      diff.forEach((change) => {
        const icon = change.type === "added" ? "+" : change.type === "removed" ? "−" : "↔";
        const highlightClass = change.type === "added" ? "diff-added" : change.type === "removed" ? "diff-removed" : "diff-changed";
        
        if (change.type === "changed") {
          diffHtml += `<div class="log-diff-item ${highlightClass}">
            <span class="diff-icon">${icon}</span>
            <span class="diff-name">${escapeHtml(change.name)}</span>
            <span class="diff-detail">${change.oldQuantity} → ${change.newQuantity}</span>
          </div>`;
        } else {
          diffHtml += `<div class="log-diff-item ${highlightClass}">
            <span class="diff-icon">${icon}</span>
            <span class="diff-name">${escapeHtml(change.name)}</span>
            <span class="diff-detail">${change.type === "added" ? `+${change.quantity}` : `${change.quantity}`}</span>
          </div>`;
        }
      });
      diffHtml += `</div>`;
    }
  } else if (entry.before && entry.before.items) {
    // Show summary for non-edit actions
    const itemCount = entry.before.items.reduce((sum, i) => sum + (i.quantity || 0), 0);
    const total = entry.before.items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 0), 0);
    diffHtml = `<div class="log-summary">${itemCount} รายการ • ${formatNumber(total)} บาท</div>`;
  } else if (entry.after && entry.after.items) {
    const itemCount = entry.after.items.reduce((sum, i) => sum + (i.quantity || 0), 0);
    const total = entry.after.items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 0), 0);
    diffHtml = `<div class="log-summary">${itemCount} รายการ • ${formatNumber(total)} บาท</div>`;
  }

  const html = `
    <div class="log-entry" data-action="${entry.action}" data-order-id="${entry.orderId || ""}">
      <div class="log-time">${dateStr} ${timeStr}</div>
      <div class="log-action">${actionText}</div>
      <div class="log-order">${orderLabel}</div>
      ${diffHtml}
    </div>
  `;

  return html;
}

/**
 * Format order summary for display (kept for backward compatibility)
 */
function formatOrderSummary(order) {
  if (!order) return "ไม่มี";

  // If items array exists and has items, show them
  if (order.items && order.items.length > 0) {
    const itemLines = order.items.map(item => 
      `${item.name} x${item.quantity} (${formatNumber(item.price)})`
    ).join('<br>');
    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const statusText = order.status === "confirmed" ? "🔒 ยืนยันแล้ว" : 
                       order.status === "editing" ? "กำลังแก้ไข" : 
                       order.status === "pending" ? "รอยืนยัน" : order.status;
    
    return `${itemLines}<div style="margin-top:4px;color:var(--accent)">รวม ${itemCount} รายการ • ${formatNumber(total)} บาท • ${statusText}</div>`;
  }
  
  // Fallback to itemCount if items array is empty/missing
  const itemCount = order.itemCount || 0;
  const statusText = order.status === "confirmed" ? "🔒 ยืนยันแล้ว" : 
                     order.status === "editing" ? "กำลังแก้ไข" : 
                     order.status === "pending" ? "รอยืนยัน" : order.status;
  
  return `${itemCount} รายการ • ${statusText}`;
}

/**
 * Format number (kept for backward compatibility)
 */
function formatNumber(value) {
  return new Intl.NumberFormat("th-TH").format(value);
}

/**
 * Escape HTML (kept for backward compatibility)
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}