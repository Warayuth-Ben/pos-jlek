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
  { name: "น้ำดื่ม", prices: [10] }
];

const tables = [
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `T${index + 1}`,
    label: `T${index + 1}`,
    status: "available",
    items: []
  })),
  { id: "T7", label: "T7", status: "disabled", items: [] },
  { id: "takeaway", label: "กลับบ้าน", status: "available", items: [] }
];

const state = {
  selectedTableId: null,
  modalAction: null
};

const menuGrid = document.querySelector("#menu-grid");
const tableGrid = document.querySelector("#table-grid");
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
const modal = document.querySelector("#confirm-modal");
const modalTitle = document.querySelector("#modal-title");
const modalMessage = document.querySelector("#modal-message");
const modalIcon = document.querySelector("#modal-icon");
const modalConfirm = document.querySelector("#modal-confirm");

let toastTimer;

function renderMenu() {
  menuGrid.innerHTML = products.map((product, productIndex) => `
    <article class="menu-card">
      <div class="menu-name">${product.name}</div>
      <div class="price-row">
        ${product.prices.map(price => `
          <button
            class="price-button"
            type="button"
            data-product="${productIndex}"
            data-price="${price}"
            aria-label="เพิ่ม ${product.name} ราคา ${price} บาท"
          >${price}</button>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function renderTables() {
  tableGrid.innerHTML = tables.map(table => `
    <button
      class="table-button ${table.status} ${table.id === "takeaway" ? "takeaway" : ""} ${state.selectedTableId === table.id ? "selected" : ""}"
      type="button"
      data-table-id="${table.id}"
      ${table.status === "disabled" ? "disabled" : ""}
      aria-pressed="${state.selectedTableId === table.id}"
    >${table.label}</button>
  `).join("");
}

function getSelectedTable() {
  return tables.find(table => table.id === state.selectedTableId) || null;
}

function formatNumber(value) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function renderBill() {
  const table = getSelectedTable();
  const hasSelection = Boolean(table);
  const hasItems = hasSelection && table.items.length > 0;

  billTitle.textContent = hasSelection ? `โต๊ะ ${table.label}` : "ยังไม่ได้เลือกโต๊ะ";
  addButton.disabled = !hasSelection;
  waterButton.disabled = !hasSelection;
  payButton.disabled = !hasItems;
  cancelButton.disabled = !hasItems;

  if (!hasSelection) {
    emptyState.querySelector("strong").textContent = "เลือกโต๊ะเพื่อเริ่มรับออเดอร์";
    emptyState.querySelector("p").textContent = "จากนั้นแตะราคาที่เมนูด้านซ้าย";
  } else if (!hasItems) {
    emptyState.querySelector("strong").textContent = "ยังไม่มีรายการอาหาร";
    emptyState.querySelector("p").textContent = "แตะราคาที่เมนูเพื่อเพิ่มเข้าบิล";
  }

  emptyState.hidden = hasItems;
  billList.hidden = !hasItems;

  if (!hasItems) {
    billList.innerHTML = "";
    totalElement.textContent = "0";
    itemCount.textContent = "0 รายการ";
    return;
  }

  billList.innerHTML = table.items.map((item, index) => `
    <div class="bill-item">
      <div class="item-info">
        <strong>${item.name}</strong>
        <span>${formatNumber(item.price)} บาท / จาน</span>
      </div>
      <div class="quantity-control">
        <button class="qty-button" type="button" data-action="decrease" data-index="${index}" aria-label="ลด ${item.name}">−</button>
        <span class="quantity">${item.quantity}</span>
        <button class="qty-button" type="button" data-action="increase" data-index="${index}" aria-label="เพิ่ม ${item.name}">+</button>
      </div>
      <div class="line-total">${formatNumber(item.price * item.quantity)}</div>
    </div>
  `).join("");

  const totalQuantity = table.items.reduce((sum, item) => sum + item.quantity, 0);
  const total = table.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
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
  showToast("กรุณาเลือกโต๊ะก่อนเพิ่มรายการ");
  tableGrid.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }],
    { duration: 220 }
  );
  return false;
}

function addItem(product, price) {
  if (!requireTable()) return;

  const table = getSelectedTable();
  const existingItem = table.items.find(item => item.name === product.name && item.price === price);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    table.items.push({ name: product.name, price, quantity: 1 });
  }

  if (table.status === "available") table.status = "waiting";
  renderTables();
  renderBill();
  showToast(`เพิ่ม ${product.name} ${price} บาท`);
}

function updateQuantity(index, change) {
  const table = getSelectedTable();
  if (!table || !table.items[index]) return;

  table.items[index].quantity += change;
  if (table.items[index].quantity <= 0) table.items.splice(index, 1);
  if (table.items.length === 0) table.status = "available";

  renderTables();
  renderBill();
}

function openModal(type) {
  const table = getSelectedTable();
  if (!table || table.items.length === 0) return;

  const total = table.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  state.modalAction = type;

  if (type === "pay") {
    modalIcon.textContent = "฿";
    modalTitle.textContent = "ยืนยันคิดเงิน";
    modalMessage.textContent = `${table.label} ยอดชำระ ${formatNumber(total)} บาท`;
    modalConfirm.textContent = "รับเงินแล้ว";
    modalConfirm.className = "action pay";
  } else {
    modalIcon.textContent = "!";
    modalTitle.textContent = "ยกเลิกบิลนี้?";
    modalMessage.textContent = `รายการทั้งหมดของ ${table.label} จะถูกล้าง`;
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
  table.items = [];
  table.status = "available";
  closeModal();
  renderTables();
  renderBill();
  showToast(action === "pay" ? `คิดเงิน ${table.label} เรียบร้อย` : `ยกเลิกบิล ${table.label} แล้ว`);
}

menuGrid.addEventListener("click", event => {
  const button = event.target.closest(".price-button");
  if (!button) return;

  const product = products[Number(button.dataset.product)];
  const price = Number(button.dataset.price);
  button.classList.add("pressed");
  setTimeout(() => button.classList.remove("pressed"), 120);
  addItem(product, price);
});

tableGrid.addEventListener("click", event => {
  const button = event.target.closest(".table-button");
  if (!button || button.disabled) return;

  state.selectedTableId = button.dataset.tableId;
  renderTables();
  renderBill();
});

billList.addEventListener("click", event => {
  const button = event.target.closest(".qty-button");
  if (!button) return;
  updateQuantity(Number(button.dataset.index), button.dataset.action === "increase" ? 1 : -1);
});

addButton.addEventListener("click", () => {
  if (!requireTable()) return;
  menuGrid.scrollTo({ top: 0, behavior: "smooth" });
  menuGrid.animate(
    [{ boxShadow: "inset 0 0 0 0 rgba(255,178,44,0)" }, { boxShadow: "inset 0 0 0 2px rgba(255,178,44,.7)" }, { boxShadow: "inset 0 0 0 0 rgba(255,178,44,0)" }],
    { duration: 650 }
  );
});

waterButton.addEventListener("click", () => addItem(products.at(-1), 10));
payButton.addEventListener("click", () => openModal("pay"));
cancelButton.addEventListener("click", () => openModal("cancel"));
document.querySelector("#modal-close").addEventListener("click", closeModal);
modalConfirm.addEventListener("click", completeModalAction);

modal.addEventListener("click", event => {
  if (event.target === modal) closeModal();
});

document.querySelector("#legend-button").addEventListener("click", () => {
  const legend = document.querySelector("#status-legend");
  legend.hidden = !legend.hidden;
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modal.hidden) closeModal();
});

function updateClock() {
  document.querySelector("#clock").textContent = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

renderMenu();
renderTables();
renderBill();
updateClock();
setInterval(updateClock, 30000);
