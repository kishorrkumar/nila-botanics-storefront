const ordersEl = document.querySelector("#orders");
const statsEl = document.querySelector("#stats");
const messageEl = document.querySelector("#message");
const integrationEl = document.querySelector("#integration");
const searchEl = document.querySelector("#search");
const filterEl = document.querySelector("#filter");
let orders = [];

const money = paise => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const date = value => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));

function renderStats() {
  const count = status => orders.filter(order => order.status === status).length;
  statsEl.innerHTML = [
    ["Total orders", orders.length], ["New", count("placed")], ["In progress", count("confirmed") + count("packing") + count("shipped")], ["Delivered", count("delivered")]
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderOrders() {
  const query = searchEl.value.trim().toLowerCase();
  const filter = filterEl.value;
  const visible = orders.filter(order => (filter === "all" || order.status === filter) && [order.order_number, order.customer_name, order.phone].join(" ").toLowerCase().includes(query));
  if (!visible.length) { ordersEl.innerHTML = '<p class="empty">No matching orders.</p>'; return; }
  ordersEl.innerHTML = visible.map(order => `
    <article class="order" data-id="${order.id}">
      <div><h2>${escapeHtml(order.order_number)}</h2><p><strong>${escapeHtml(order.customer_name)}</strong><br>${escapeHtml(order.phone)}${order.email ? `<br>${escapeHtml(order.email)}` : ""}</p><p>${escapeHtml(order.address_line)}, ${escapeHtml(order.city)} — ${escapeHtml(order.postal_code)}</p></div>
      <div><p><strong>Items</strong></p>${order.items.map(item => `<p>${escapeHtml(item.name)} × ${item.quantity}</p>`).join("")}<p><strong>${money(order.total_paise)}</strong></p></div>
      <div><p><strong>Placed</strong><br>${date(order.created_at)}</p><label>Status<br><select class="status">${["placed","confirmed","packing","shipped","delivered","cancelled"].map(status => `<option ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}</select></label><p class="call-state">Call: ${escapeHtml(order.call_status)}${order.call_id ? ` · #${order.call_id}` : ""}</p><p>Voice consent: <strong>${order.voice_call_consent ? "Yes" : "No"}</strong></p></div>
      <div class="actions"><button class="save">Save status</button><button class="secondary call" ${order.voice_call_consent ? "" : "disabled"}>${["failed","no_pickup","busy"].includes(order.call_status) ? "Retry call" : "Call customer"}</button><button class="refresh" ${order.call_id ? "" : "disabled"}>Refresh call</button></div>
      ${(order.call_summary || order.call_transcript || order.call_recording_url || order.call_disposition || order.call_error) ? `<details class="call-details"><summary>Call result</summary>${order.call_error ? `<p class="error"><strong>Error</strong><br>${escapeHtml(order.call_error)}</p>` : ""}${order.call_summary ? `<p><strong>Summary</strong><br>${escapeHtml(order.call_summary)}</p>` : ""}${order.call_disposition ? `<p><strong>Disposition</strong><br>${escapeHtml(JSON.stringify(order.call_disposition))}</p>` : ""}${order.call_duration_seconds != null ? `<p>${order.call_duration_seconds}s · ${order.call_cost_paise == null ? "Cost pending" : money(order.call_cost_paise)}</p>` : ""}${order.call_recording_url ? `<p><a href="${escapeHtml(order.call_recording_url)}" target="_blank" rel="noreferrer">Open recording</a></p>` : ""}${order.call_transcript ? `<pre>${escapeHtml(order.call_transcript)}</pre>` : ""}</details>` : ""}
    </article>`).join("");
}

async function loadOrders() {
  messageEl.textContent = "Loading…";
  const [response, integrationResponse] = await Promise.all([fetch("/api/admin/orders", { cache: "no-store" }), fetch("/api/admin/snapserve", { cache: "no-store" })]);
  if (!response.ok) throw new Error("Unable to load orders");
  orders = (await response.json()).orders;
  if (integrationResponse.ok) {
    const integration = await integrationResponse.json();
    integrationEl.className = `integration ${integration.mode === "not_configured" ? "warning" : "ready"}`;
    integrationEl.textContent = integration.mode === "not_configured"
      ? "SnapServe is not configured. Add the Render environment variables before placing calls."
      : `SnapServe: ${integration.mode.replace("_", " ")} · Automatic calls ${integration.automaticCalls ? "on" : "off"} · Result webhook ${integration.resultWebhook ? "ready" : "not configured"}`;
  }
  renderStats(); renderOrders(); messageEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

ordersEl.addEventListener("click", async event => {
  const card = event.target.closest(".order");
  if (!card || !(event.target instanceof HTMLButtonElement)) return;
  const id = card.dataset.id;
  event.target.disabled = true; messageEl.textContent = "Working…";
  try {
    const isCall = event.target.classList.contains("call");
    const isRefresh = event.target.classList.contains("refresh");
    const endpoint = isCall ? `/api/admin/orders/${id}/call` : isRefresh ? `/api/admin/orders/${id}/call/refresh` : `/api/admin/orders/${id}`;
    const response = await fetch(endpoint, {
      method: (isCall || isRefresh) ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: (isCall || isRefresh) ? undefined : JSON.stringify({ status: card.querySelector(".status").value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Action failed");
    messageEl.textContent = isCall ? "Delivery call started." : isRefresh ? "Call details refreshed." : "Order status updated.";
    await loadOrders();
  } catch (error) { messageEl.textContent = error.message; messageEl.className = "error"; }
  finally { event.target.disabled = false; }
});

document.querySelector("#refresh").addEventListener("click", () => loadOrders().catch(showError));
searchEl.addEventListener("input", renderOrders);
filterEl.addEventListener("change", renderOrders);
function showError(error) { messageEl.textContent = error.message; messageEl.className = "error"; ordersEl.innerHTML = '<p class="empty error">Could not load orders.</p>'; }
loadOrders().catch(showError);
