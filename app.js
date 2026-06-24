const products = [
  { name: "ข้าวมันไก่", prices: [40, 50, 60] },
  { name: "ข้าวมันไก่ทอด", prices: [40, 50, 60] },
  { name: "ข้าวมันไก่ผสมไก่ทอด", prices: [60, 70] },
  { name: "ข้าวมันไก่ผสมหมูกรอบ", prices: [60, 70] },
  { name: "หมูแดง", prices: [50, 60] },
  { name: "หมูกรอบ", prices: [50, 60] },
  { name: "ต้มเลือดหมู", prices: [50, 60] },
  { name: "ข้าวเปล่า", prices: [10] },
  { name: "ข้าวมันเปล่า", prices: [15, 20] },
  { name: "ไก่สับ", prices: [100] },
  { name: "หมูกรอบสับ", prices: [100] },
  { name: "น้ำดื่ม", prices: [10] },
];

const tables = [
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `T${index + 1}`,
    label: `T${index + 1}`,
    status: "available",
    orders: [],
    nextOrderId: 1,
  })),
  { id: "T7", label: "T7", status: "disabled", orders: [], nextOrderId: 1 },
];

const takeawayBills = [];
let takeawayCounter = 0;

const state = {
  selectedTableId: null,
  modalAction: null,
};

const STORAGE_KEY = "pos-jlek-state";

// ─── Order Helpers ──────────────────────────────────────────────

/**
 * Create a new order object for a bill.
 */
function createOrder(bill) {
  const order = {
    id: bill.nextOrderId++,
    status: "pending",
    createdAt: Date.now(),
    confirmedAt: null,
    updatedAt: null,
    items: [],
  };
  bill.orders.push(order);
  return order;
}

/**
 * Get the current pending (active) order for a bill, or null.
 */
function getActiveOrder(bill) {
  return bill.orders.find((o) => o.status === "pending") || null;
}

/**
 * Get the order currently being edited, or null.
 */
function getEditingOrder(bill) {
  return bill.orders.find((o) => o.status === "editing") || null;
}

/**
 * Get the pending order, or create one if none exists.
 * Does NOT create during edit mode — returns the editing order instead.
 */
function getOrCreateActiveOrder(bill) {
  // During edit mode, return the editing order (don't create new)
  if (bill.status === "editing") {
    const editing = getEditingOrder(bill);
    if (editing) return editing;
  }
  let active = getActiveOrder(bill);
  if (!active) {
    active = createOrder(bill);
  }
  return active;
}

/**
 * Get the order whose items should be displayed.
 * Priority: editing > pending > last confirmed
 */
function getDisplayOrder(bill) {
  // During edit mode, show the editing order
  if (bill.status === "editing") {
    const editing = getEditingOrder(bill);
    if (editing) return editing;
  }
  const active = getActiveOrder(bill);
  if (active) return active;
  // Fall back to the most recent order
  return bill.orders.length > 0 ? bill.orders[bill.orders.length - 1] : null;
}

/**
 * Flatten all items across all orders for summary/total calculations.
 */
function getBillItems(bill) {
  return bill.orders.flatMap((o) => o.items);
}

/**
 * Check if a bill has any items across all orders.
 */
function hasBillItems(bill) {
  return bill.orders.some((o) => o.items.length > 0);
}

// ─── Persistence ─────────────────────────────────────────────────

function saveState() {
  try {
    const data = {
      tables: tables.map((t) => ({
        id: t.id,
        label: t.label,
        status: t.status,
        orders: t.orders.map((o) => ({
          id: o.id,
          status: o.status,
          createdAt: o.createdAt,
          confirmedAt: o.confirmedAt,
          updatedAt: o.updatedAt,
          items: o.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
        })),
        nextOrderId: t.nextOrderId,
      })),
      takeawayBills: takeawayBills.map((b) => ({
        id: b.id,
        label: b.label,
        status: b.status,
        orders: b.orders.map((o) => ({
          id: o.id,
          status: o.status,
          createdAt: o.createdAt,
          confirmedAt: o.confirmedAt,
          updatedAt: o.updatedAt,
          items: o.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
        })),
        nextOrderId: b.nextOrderId,
        createdAt: b.createdAt,
        viewed: b.viewed,
      })),
      selectedTableId: state.selectedTableId,
      takeawayCounter: takeawayCounter,
      _version: 2,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // silently fail if localStorage is full or unavailable
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return;

    const isLegacy = !data._version || data._version < 2;

    // Restore tables — merge saved data into default table objects
    if (Array.isArray(data.tables)) {
      data.tables.forEach((saved) => {
        const table = tables.find((t) => t.id === saved.id);
        if (!table) return;

        table.status = saved.status || "available";

        if (isLegacy && Array.isArray(saved.items)) {
          // Legacy format: flat items[] → migrate to orders[0]
          table.orders = [{
            id: 1,
            status: (saved.status === "waiting" || saved.status === "editing")
              ? "confirmed" : "pending",
            createdAt: Date.now(),
            confirmedAt: (saved.status === "waiting" || saved.status === "editing")
              ? Date.now() : null,
            updatedAt: Date.now(),
            items: saved.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
          }];
          table.nextOrderId = 2;
        } else if (Array.isArray(saved.orders)) {
          // New format: restore orders
          table.orders = saved.orders.map((o) => ({
            id: o.id,
            status: o.status,
            createdAt: o.createdAt,
            confirmedAt: o.confirmedAt,
            updatedAt: o.updatedAt,
            items: Array.isArray(o.items) ? o.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })) : [],
          }));
          table.nextOrderId = typeof saved.nextOrderId === "number" ? saved.nextOrderId : 1;
        }
      });
    }

    // Restore takeaway bills
    if (Array.isArray(data.takeawayBills)) {
      takeawayBills.length = 0;
      data.takeawayBills.forEach((saved) => {
        const bill = {
          id: saved.id,
          label: saved.label || saved.id,
          status: saved.status || "ordering",
          orders: [],
          nextOrderId: 1,
          createdAt: saved.createdAt,
          viewed: saved.viewed === true,
        };

        if (isLegacy && Array.isArray(saved.items)) {
          // Legacy format: flat items[] → migrate to orders[0]
          bill.orders = [{
            id: 1,
            status: "pending",
            createdAt: Date.now(),
            confirmedAt: null,
            updatedAt: Date.now(),
            items: saved.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
          }];
          bill.nextOrderId = 2;
        } else if (Array.isArray(saved.orders)) {
          bill.orders = saved.orders.map((o) => ({
            id: o.id,
            status: o.status,
            createdAt: o.createdAt,
            confirmedAt: o.confirmedAt,
            updatedAt: o.updatedAt,
            items: Array.isArray(o.items) ? o.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })) : [],
          }));
          bill.nextOrderId = typeof saved.nextOrderId === "number" ? saved.nextOrderId : 1;
        }

        takeawayBills.push(bill);
      });
    }

    // Restore counter
    if (typeof data.takeawayCounter === "number") {
      takeawayCounter = data.takeawayCounter;
    }

    // Restore selection (validate it still exists)
    if (data.selectedTableId) {
      const exists =
        tables.some((t) => t.id === data.selectedTableId) ||
        takeawayBills.some((b) => b.id === data.selectedTableId);
      if (exists) {
        state.selectedTableId = data.selectedTableId;
      }
    }
  } catch {
    // silently fail on corrupt data
  }
}

window.resetPOSData = function () {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
};

const menuGrid = document.querySelector("#menu-grid");
const tableGrid = document.querySelector("#table-grid");
const takeawayGrid = document.querySelector("#takeaway-grid");
const takeawayCount = document.querySelector("#takeaway-count");
const newTakeawayButton = document.querySelector("#new-takeaway-button");
const billTitle = document.querySelector("#bill-title");
const billList = document.querySelector("#bill-list");
const emptyState = document.querySelector("#empty-state");
const totalElement = document.querySelector("#total");
const itemCount = document.querySelector("#item-count");
const toast = document.querySelector("#toast");
const addButton = document.querySelector("#add-button");
const waterButton = document.querySelector("#water-button");
const payButton = document.querySelector("#pay-button");
const cancelButton = document.querySelector("#cancel-button");
const confirmOrderButton = document.querySelector("#confirm-order-button");
const editOrderButton = document.querySelector("#edit-order-button");
const confirmEditButton = document.querySelector("#confirm-edit-button");
const modal = document.querySelector("#confirm-modal");
const modalTitle = document.querySelector("#modal-title");
const modalMessage = document.querySelector("#modal-message");
const modalIcon = document.querySelector("#modal-icon");
const modalConfirm = document.querySelector("#modal-confirm");

let toastTimer;

function renderMenu() {
  menuGrid.innerHTML = products
    .map(
      (product, productIndex) => `
    <article class="menu-card">
      <div class="menu-name">${product.name}</div>
      <div class="price-row">
        ${product.prices
          .map(
            (price) => `
          <button
            class="price-button"
            type="button"
            data-product="${productIndex}"
            data-price="${price}"
            aria-label="เพิ่ม ${product.name} ราคา ${price} บาท"
          >${price}</button>
        `,
          )
          .join("")}
      </div>
    </article>
  `,
    )
    .join("");
}

function renderTables() {
  tableGrid.innerHTML = tables
    .map(
      (table) => `
    <button
      class="table-button ${table.status} ${state.selectedTableId === table.id ? "selected" : ""}"
      type="button"
      data-table-id="${table.id}"
      ${table.status === "disabled" ? "disabled" : ""}
      aria-pressed="${state.selectedTableId === table.id}"
    >${table.label}</button>
  `,
    )
    .join("");

  renderTakeawayBills();
  saveState();
}

function getSelectedTable() {
  return (
    tables.find((table) => table.id === state.selectedTableId) ||
    takeawayBills.find((b) => b.id === state.selectedTableId) ||
    null
  );
}

function isTakeaway(id) {
  return id && id.startsWith("TA-");
}

function getTableDisplayName(table) {
  if (!table) return "";
  return isTakeaway(table.id) ? `กลับบ้าน ${table.label}` : `โต๊ะ ${table.label}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("th-TH").format(value);
}


function renderBill() {
  const table = getSelectedTable();
  const hasSelection = Boolean(table);
  const hasItems = hasSelection && hasBillItems(table);
  billTitle.textContent = hasSelection
    ? getTableDisplayName(table)
    : "ยังไม่ได้เลือกโต๊ะ";

  // Menu add buttons — disabled only when no selection
  addButton.disabled = !hasSelection;
  waterButton.disabled = !hasSelection;

  payButton.disabled = !hasItems;
  cancelButton.disabled = !hasItems;
  confirmOrderButton.disabled = !hasItems || table?.status !== "ordering";
  confirmOrderButton.hidden = !hasItems || table?.status !== "ordering";

  // Edit functionality moved to per-order buttons inside bill sections
  editOrderButton.hidden = true;

  // Confirm edit button: visible only when editing
  confirmEditButton.hidden = !hasItems || table?.status !== "editing";

  if (!hasSelection) {
    emptyState.querySelector("strong").textContent =
      "เลือกโต๊ะเพื่อเริ่มรับออเดอร์";
    emptyState.querySelector("p").textContent = "จากนั้นแตะราคาที่เมนูด้านซ้าย";
  } else if (!hasItems) {
    emptyState.querySelector("strong").textContent = "ยังไม่มีรายการอาหาร";
    emptyState.querySelector("p").textContent =
      "แตะราคาที่เมนูเพื่อเพิ่มเข้าบิล";
  }

  emptyState.hidden = hasItems;
  billList.hidden = !hasItems;

  if (!hasItems) {
    billList.innerHTML = "";
    totalElement.textContent = "0";
    itemCount.textContent = "0 รายการ";
    return;
  }

  // Render ALL orders sequentially
  billList.innerHTML = table.orders
    .map((order, orderIndex) => {
      const isEditable = order.status === "pending" || order.status === "editing";
      const statusLabel = order.status === "confirmed" ? "ยืนยันแล้ว" : order.status === "editing" ? "กำลังแก้ไข" : "รอยืนยัน";
      const orderTotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const itemsHtml = order.items
        .map(
          (item, itemIndex) => `
        <div class="bill-item">
          <div class="item-info">
            <strong>${item.name}</strong>
            <span>${formatNumber(item.price)} บาท / จาน</span>
          </div>
          <div class="quantity-control">
            <button class="qty-button" type="button" data-order-index="${orderIndex}" data-action="decrease" data-index="${itemIndex}" aria-label="ลด ${item.name}" ${isEditable ? "" : "disabled"}>−</button>
            <span class="quantity">${item.quantity}</span>
            <button class="qty-button" type="button" data-order-index="${orderIndex}" data-action="increase" data-index="${itemIndex}" aria-label="เพิ่ม ${item.name}" ${isEditable ? "" : "disabled"}>+</button>
          </div>
          <div class="line-total">${formatNumber(item.price * item.quantity)}</div>
        </div>
      `,
        )
        .join("");

      const subtotalHtml = order.items.length > 0
        ? `<div class="order-subtotal">รวมย่อย <strong>${formatNumber(orderTotal)}</strong> บาท</div>`
        : "";

      const showEditBtn = table.status !== "editing" && order.status === "confirmed";
      const showResetBtn = order.status === "editing" && order._snapshot;

      return `
      <div class="order-section ${order.status}">
        <div class="order-header">
          <h3>ออเดอร์ #${String(order.id).padStart(2, "0")}</h3>
          <span class="order-status-badge ${order.status}">${statusLabel}</span>
          ${showEditBtn ? `<button class="edit-order-button" type="button" data-order-index="${orderIndex}">✏️ แก้ไข</button>` : ""}
          ${showResetBtn ? `<button class="reset-order-button" type="button" data-order-index="${orderIndex}">↺ รีเซ็ต</button>` : ""}
        </div>
        ${itemsHtml}
        ${subtotalHtml}
      </div>
    `;
    })
    .join("");

  // Grand total across all orders
  const billItems = getBillItems(table);
  const totalQuantity = billItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const total = billItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  itemCount.textContent = `${formatNumber(totalQuantity)} รายการ`;
  totalElement.textContent = formatNumber(total);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function requireTable() {
  if (getSelectedTable()) return true;
  if (takeawayBills.length > 0) {
    state.selectedTableId = takeawayBills[0].id;
    renderTables();
    renderBill();
    return true;
  }
  showToast("กรุณาเลือกโต๊ะก่อนเพิ่มรายการ");
  tableGrid.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 220 },
  );
  return false;
}

function addItem(product, price) {
  if (!requireTable()) return;

  const table = getSelectedTable();

  // Choose the target order based on the current workflow
  let order;

  if (table.status === "editing") {
    // ─── Edit Workflow ─────────────────────────────────────────
    // Adding items during edit: use the editing order directly
    order = getEditingOrder(table);
    if (!order) {
      showToast("ไม่พบออเดอร์ที่กำลังแก้ไข");
      return;
    }
  } else {
    // ─── Add-on Workflow ───────────────────────────────────────
    // If there's already a pending order, use it
    // Otherwise (all confirmed or no orders), create a new one
    order = getActiveOrder(table);
    if (!order) {
      order = createOrder(table);
    }
  }

  let existingItem = null;

  // Merge with existing item if order allows
  if (order.status === "pending" || order.status === "editing") {
    existingItem = order.items.find(
      (item) => item.name === product.name && item.price === price,
    );
  }

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    order.items.push({ name: product.name, price, quantity: 1 });
  }

  // Update table status to reflect pending orders
  if (table.status !== "editing" && table.status !== "ordering") {
    table.status = "ordering";
  }
  renderTables();
  renderBill();
  showToast(`เพิ่ม ${product.name} ${price} บาท`);
}

function updateQuantity(orderIndex, itemIndex, change) {
  const table = getSelectedTable();
  if (!table) return;

  const order = table.orders[orderIndex];
  if (!order || !order.items[itemIndex]) return;

  // Only allow editing pending or editing orders
  if (order.status !== "pending" && order.status !== "editing") return;

  order.items[itemIndex].quantity += change;
  if (order.items[itemIndex].quantity <= 0) order.items.splice(itemIndex, 1);

  if (!hasBillItems(table)) {
    if (isTakeaway(table.id)) {
      deleteTakeawayBill(table);
    } else {
      table.orders = [];
      table.nextOrderId = 1;
      table.status = "available";
    }
  }

  renderTables();
  renderBill();
}

function openModal(type) {
  const table = getSelectedTable();
  if (!table || !hasBillItems(table)) return;

  const billItems = getBillItems(table);
  const total = billItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  state.modalAction = type;
  const displayName = getTableDisplayName(table);

  if (type === "confirm") {
    modalIcon.textContent = "✓";
    modalTitle.textContent = "ยืนยันออเดอร์";
    modalMessage.textContent = `ส่งรายการของ ${displayName} เข้าครัว ?`;

    modalConfirm.textContent = "ยืนยัน";
    modalConfirm.className = "action confirm";
  } else if (type === "pay") {
    modalIcon.textContent = "฿";
    modalTitle.textContent = "ยืนยันคิดเงิน";
    modalMessage.textContent = `${displayName} ยอดชำระ ${formatNumber(total)} บาท`;

    modalConfirm.textContent = "รับเงินแล้ว";
    modalConfirm.className = "action pay";
  } else {
    modalIcon.textContent = "!";
    modalTitle.textContent = "ยกเลิกบิลนี้?";
    modalMessage.textContent = `รายการทั้งหมดของ ${displayName} จะถูกล้าง`;

    modalConfirm.textContent = "ยกเลิกบิล";
    modalConfirm.className = "action cancel";
  }

  modal.hidden = false;
  modalConfirm.focus();
}

function closeModal() {
  modal.hidden = true;
  state.modalAction = null;
}

function completeModalAction() {
  const table = getSelectedTable();
  if (!table) return closeModal();

  const action = state.modalAction;
  const displayName = getTableDisplayName(table);

  if (action === "confirm") {
    // Confirm the active (pending) order
    const activeOrder = getActiveOrder(table);
    if (activeOrder) {
      activeOrder.status = "confirmed";
      activeOrder.confirmedAt = Date.now();
      activeOrder.updatedAt = Date.now();
    }
    table.status = "waiting";
    closeModal();
    renderTables();
    renderBill();
    showToast(`ส่งออเดอร์ ${displayName} แล้ว`);
    return;
  }

  // pay or cancel
  closeModal();

  if (isTakeaway(table.id)) {
    deleteTakeawayBill(table);
    showToast(
      action === "pay"
        ? `คิดเงิน ${displayName} เรียบร้อย`
        : `ยกเลิกบิล ${displayName} แล้ว`,
    );
  } else {
    table.orders = [];
    table.nextOrderId = 1;
    table.status = "available";
    renderTables();
    renderBill();
    showToast(
      action === "pay"
        ? `คิดเงิน ${displayName} เรียบร้อย`
        : `ยกเลิกบิล ${displayName} แล้ว`,
    );
  }
}

let newBillId = null;
let newBillTimer = null;

function createNewTakeawayBill() {
  takeawayCounter++;
  const id = `TA-${takeawayCounter}`;
  const label = `#${String(takeawayCounter).padStart(3, "0")}`;
  takeawayBills.push({
    id,
    label,
    status: "ordering",
    orders: [],
    nextOrderId: 1,
    createdAt: Date.now(),
    viewed: false,
  });

  // Pulse the new bill for 3 seconds (keep current selection unchanged)
  clearTimeout(newBillTimer);
  newBillId = id;
  renderTables();
  renderBill();
  showToast(`เปิดบิลกลับบ้าน ${label} แล้ว`);

  newBillTimer = setTimeout(() => {
    newBillId = null;
    renderTables();
  }, 3000);
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function formatElapsed(ts) {
  if (!ts) return null;
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "เปิดเมื่อสักครู่";
  if (minutes < 60) return `เปิด ${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours < 24) {
    return remaining > 0 ? `เปิด ${hours} ชม. ${remaining} นาทีที่แล้ว` : `เปิด ${hours} ชม.ที่แล้ว`;
  }
  const days = Math.floor(hours / 24);
  return `เปิด ${days} วันที่แล้ว`;
}

function renderTakeawayBills() {
  takeawayCount.textContent = takeawayBills.length;

  if (takeawayBills.length === 0) {
    takeawayGrid.innerHTML = "";
    return;
  }

  takeawayGrid.innerHTML = takeawayBills
    .map(
      (bill) => {
        const billItems = getBillItems(bill);
        const itemCount = billItems.reduce((sum, item) => sum + item.quantity, 0);
        const total = billItems.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0,
        );
        const summary =
          itemCount > 0
            ? `${formatNumber(itemCount)} รายการ • ${formatNumber(total)}฿`
            : "0 รายการ";
        const timeStr = bill.createdAt ? formatTime(bill.createdAt) : "";
        const elapsedStr = bill.createdAt ? formatElapsed(bill.createdAt) : "";

        const isPulsing = bill.id === newBillId;
        const showNewBadge = !bill.viewed && bill.id !== newBillId;
        const classes = [
          "takeaway-bill-button",
          state.selectedTableId === bill.id ? "selected" : "",
          isPulsing ? "pulse" : "",
        ].filter(Boolean).join(" ");

        return `
    <button
      class="${classes}"
      type="button"
      data-takeaway-id="${bill.id}"
      aria-pressed="${state.selectedTableId === bill.id}"
    >
      <span class="takeaway-bill-label">${bill.label}</span>
      <span class="takeaway-bill-time">${timeStr}</span>
      <span class="takeaway-bill-summary">${summary}</span>
      <span class="takeaway-bill-elapsed">${elapsedStr}</span>
      ${showNewBadge ? '<span class="takeaway-new-badge">NEW</span>' : ""}
    </button>
  `;
      },
    )
    .join("");
}

function deleteTakeawayBill(table) {
  const idx = takeawayBills.indexOf(table);
  if (idx === -1) return;

  takeawayBills.splice(idx, 1);

  if (takeawayBills.length > 0) {
    const nextIdx = Math.min(idx, takeawayBills.length - 1);
    state.selectedTableId = takeawayBills[nextIdx].id;
  } else {
    state.selectedTableId = null;
  }

  renderTables();
  renderBill();
}

menuGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".price-button");
  if (!button) return;

  const product = products[Number(button.dataset.product)];
  const price = Number(button.dataset.price);
  button.classList.add("pressed");
  setTimeout(() => button.classList.remove("pressed"), 120);
  addItem(product, price);
});

tableGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".table-button");
  if (!button || button.disabled) return;

  state.selectedTableId = button.dataset.tableId;
  renderTables();
  renderBill();
});

takeawayGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".takeaway-bill-button");
  if (!button) return;

  const id = button.dataset.takeawayId;
  const bill = takeawayBills.find((b) => b.id === id);
  if (bill && !bill.viewed) {
    bill.viewed = true;
  }

  state.selectedTableId = id;
  renderTables();
  renderBill();
});

newTakeawayButton.addEventListener("click", createNewTakeawayBill);

// Per-order edit: handled via billList click delegation

confirmEditButton.addEventListener("click", () => {
  const table = getSelectedTable();
  if (!table) return;

  // Find the order being edited
  const editingOrder = getEditingOrder(table);
  if (!editingOrder) {
    showToast("ไม่พบออเดอร์ที่กำลังแก้ไข");
    return;
  }

  // Clear snapshot before finalizing
  delete editingOrder._snapshot;

  // Finalize the edit: mark as confirmed, update timestamps
  editingOrder.status = "confirmed";
  editingOrder.updatedAt = Date.now();
  editingOrder.confirmedAt = editingOrder.confirmedAt || Date.now();

  // Return table to waiting status (has confirmed orders)
  table.status = "waiting";

  renderTables();
  renderBill();
  showToast(`ยืนยันการแก้ไขออเดอร์ #${String(editingOrder.id).padStart(2, "0")} ของ ${getTableDisplayName(table)} แล้ว`);
});

billList.addEventListener("click", (event) => {
  const table = getSelectedTable();
  if (!table) return;

  // Handle reset button (restore from snapshot)
  const resetBtn = event.target.closest(".reset-order-button");
  if (resetBtn) {
    const orderIndex = Number(resetBtn.dataset.orderIndex);
    const orderToReset = table.orders[orderIndex];
    if (!orderToReset || orderToReset.status !== "editing" || !orderToReset._snapshot) return;

    // Restore items from snapshot (deep clone)
    orderToReset.items = orderToReset._snapshot.map((i) => ({ ...i }));

    renderTables();
    renderBill();
    showToast(`รีเซ็ตออเดอร์ #${String(orderToReset.id).padStart(2, "0")} เป็นค่าเดิม`);
    return;
  }

  // Handle per-order edit button
  const editBtn = event.target.closest(".edit-order-button");
  if (editBtn) {
    const orderIndex = Number(editBtn.dataset.orderIndex);
    const orderToEdit = table.orders[orderIndex];
    if (!orderToEdit || orderToEdit.status !== "confirmed") return;

    // Store snapshot before any changes (deep clone items)
    orderToEdit._snapshot = orderToEdit.items.map((i) => ({ ...i }));
    orderToEdit.status = "editing";
    table.status = "editing";

    renderTables();
    renderBill();
    showToast(`กำลังแก้ไขออเดอร์ #${String(orderToEdit.id).padStart(2, "0")} ของ ${getTableDisplayName(table)}`);
    return;
  }

  // Handle quantity buttons
  const button = event.target.closest(".qty-button");
  if (!button) return;

  const orderIndex = Number(button.dataset.orderIndex);
  const order = table.orders[orderIndex];

  // Prevent quantity changes on locked orders
  if (!order || (order.status !== "pending" && order.status !== "editing")) return;

  updateQuantity(
    orderIndex,
    Number(button.dataset.index),
    button.dataset.action === "increase" ? 1 : -1,
  );
});

addButton.addEventListener("click", () => {
  if (!requireTable()) return;
  menuGrid.scrollTo({ top: 0, behavior: "smooth" });
  menuGrid.animate(
    [
      { boxShadow: "inset 0 0 0 0 rgba(255,178,44,0)" },
      { boxShadow: "inset 0 0 0 2px rgba(255,178,44,.7)" },
      { boxShadow: "inset 0 0 0 0 rgba(255,178,44,0)" },
    ],
    { duration: 650 },
  );
});

waterButton.addEventListener("click", () => addItem(products.at(-1), 10));
confirmOrderButton.addEventListener("click", () => openModal("confirm"));

payButton.addEventListener("click", () => openModal("pay"));
cancelButton.addEventListener("click", () => openModal("cancel"));
document.querySelector("#modal-close").addEventListener("click", closeModal);
modalConfirm.addEventListener("click", completeModalAction);

modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

document.querySelector("#legend-button").addEventListener("click", () => {
  const legend = document.querySelector("#status-legend");
  legend.hidden = !legend.hidden;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) closeModal();
});

function updateClock() {
  document.querySelector("#clock").textContent = new Intl.DateTimeFormat(
    "th-TH",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
  ).format(new Date());
}

loadState();
renderMenu();
renderTables();
renderBill();
updateClock();
setInterval(updateClock, 30000);