const ordersEl = document.querySelector("#orders");
const statsEl = document.querySelector("#stats");
const messageEl = document.querySelector("#message");
const integrationEl = document.querySelector("#integration");
const searchEl = document.querySelector("#search");
const filterEl = document.querySelector("#filter");
const periodEl = document.querySelector("#analytics-period");
let orders = [];
let agents = [];

const money = paise => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format((Number(paise) || 0) / 100);
const date = value => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const dayLabel = value => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
const percent = (part, total) => total ? Math.round((part / total) * 100) : 0;
const duration = seconds => seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

function renderStats() {
  const count = status => orders.filter(order => order.status === status).length;
  statsEl.innerHTML = [
    ["Total orders", orders.length], ["New", count("placed")], ["In progress", count("confirmed") + count("packing") + count("shipped")], ["Delivered", count("delivered")]
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function agentOptions(order) {
  const knownIds = new Set(agents.map(agent => String(agent.id)));
  const previous = order.call_agent_id && !knownIds.has(String(order.call_agent_id))
    ? `<option value="${order.call_agent_id}">${escapeHtml(order.call_agent_name || `Agent #${order.call_agent_id}`)}</option>` : "";
  return `<option value="">Default / campaign agent</option>${previous}${agents.map(agent => `<option value="${agent.id}" ${String(order.call_agent_id) === String(agent.id) ? "selected" : ""}>${escapeHtml(agent.name)}${agent.status && agent.status !== "available" ? ` · ${escapeHtml(agent.status)}` : ""}</option>`).join("")}`;
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
      <div class="actions"><button class="save">Save status</button><label class="agent-label">Call with<select class="agent" ${order.voice_call_consent ? "" : "disabled"}>${agentOptions(order)}</select></label><button class="secondary call" ${order.voice_call_consent ? "" : "disabled"}>${["failed","no_pickup","busy"].includes(order.call_status) ? "Retry call" : "Call customer"}</button><button class="muted refresh" ${order.call_id ? "" : "disabled"}>Refresh call</button></div>
      ${!order.voice_call_consent ? '<p class="consent-note">Calling is disabled because this customer did not give voice-call consent.</p>' : ""}
      ${(order.call_summary || order.call_transcript || order.call_recording_url || order.call_disposition || order.call_error || order.call_agent_name) ? `<details class="call-details"><summary>Call result</summary>${order.call_agent_name ? `<p><strong>Agent</strong><br>${escapeHtml(order.call_agent_name)}</p>` : ""}${order.call_error ? `<p class="error"><strong>Error</strong><br>${escapeHtml(order.call_error)}</p>` : ""}${order.call_summary ? `<p><strong>Summary</strong><br>${escapeHtml(order.call_summary)}</p>` : ""}${order.call_disposition ? `<p><strong>Disposition</strong><br>${escapeHtml(JSON.stringify(order.call_disposition))}</p>` : ""}${order.call_duration_seconds != null ? `<p>${order.call_duration_seconds}s · ${order.call_cost_paise == null ? "Cost pending" : money(order.call_cost_paise)}</p>` : ""}${order.call_recording_url ? `<p><a href="${escapeHtml(order.call_recording_url)}" target="_blank" rel="noreferrer">Open recording</a></p>` : ""}${order.call_transcript ? `<pre>${escapeHtml(order.call_transcript)}</pre>` : ""}</details>` : ""}
    </article>`).join("");
}

function renderAnalytics(data) {
  const { summary, calls } = data;
  document.querySelector("#metrics").innerHTML = [
    ["Revenue", money(summary.revenue_paise), `${summary.active_orders} non-cancelled orders`],
    ["Orders", summary.total_orders, `${summary.customers} unique customers`],
    ["Average order", money(summary.average_order_paise), "Per non-cancelled order"],
    ["Call completion", `${percent(calls.completed, calls.attempted)}%`, `${calls.completed} of ${calls.attempted} attempts`]
  ].map(([label, value, note]) => `<article class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join("");

  const maxRevenue = Math.max(...data.daily.map(row => row.revenue_paise), 1);
  document.querySelector("#sales-chart").innerHTML = data.daily.length ? data.daily.map(row => `<div class="bar-column" title="${escapeHtml(dayLabel(row.day))}: ${money(row.revenue_paise)} from ${row.orders} orders"><div class="bar-value">${money(row.revenue_paise)}</div><div class="bar" style="height:${Math.max(5, Math.round(row.revenue_paise / maxRevenue * 150))}px"></div><span>${escapeHtml(dayLabel(row.day))}</span></div>`).join("") : '<p class="empty compact">No sales in this period.</p>';

  const maxStatus = Math.max(...data.statuses.map(row => row.count), 1);
  document.querySelector("#status-chart").innerHTML = data.statuses.length ? data.statuses.map(row => `<div class="progress-row"><div><span class="status-dot ${escapeHtml(row.status)}"></span><strong>${escapeHtml(row.status)}</strong><b>${row.count}</b></div><div class="progress"><i style="width:${Math.round(row.count / maxStatus * 100)}%"></i></div></div>`).join("") : '<p class="empty compact">No order data.</p>';

  document.querySelector("#product-table").innerHTML = data.products.length ? `<table><thead><tr><th>Product</th><th>Units</th><th>Value</th></tr></thead><tbody>${data.products.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${row.quantity}</td><td>${money(row.revenue_paise)}</td></tr>`).join("")}</tbody></table>` : '<p class="empty compact">No product data.</p>';

  const agentRows = data.agents.length ? data.agents.map(agent => `<li><span>${escapeHtml(agent.name)}</span><strong>${agent.calls} calls · ${percent(agent.completed, agent.calls)}% complete</strong></li>`).join("") : '<li><span>No agent calls yet</span></li>';
  document.querySelector("#call-analytics").innerHTML = `<div class="call-kpis"><div><strong>${calls.attempted}</strong><span>Attempted</span></div><div><strong>${calls.completed}</strong><span>Completed</span></div><div><strong>${calls.unsuccessful}</strong><span>Unsuccessful</span></div></div><p class="call-total">${duration(calls.duration_seconds)} total talk time · ${money(calls.cost_paise)} call cost</p><h4>Agents used</h4><ul class="agent-performance">${agentRows}</ul>`;
}

async function loadAnalytics() {
  const response = await fetch(`/api/admin/analytics?days=${periodEl.value}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load analytics");
  renderAnalytics(await response.json());
}

async function loadData() {
  messageEl.className = "";
  messageEl.textContent = "Loading…";
  const [ordersResponse, integrationResponse, agentsResponse] = await Promise.all([
    fetch("/api/admin/orders", { cache: "no-store" }),
    fetch("/api/admin/snapserve", { cache: "no-store" }),
    fetch("/api/admin/snapserve/agents", { cache: "no-store" })
  ]);
  if (!ordersResponse.ok) throw new Error("Unable to load orders");
  orders = (await ordersResponse.json()).orders;
  if (agentsResponse.ok) agents = (await agentsResponse.json()).agents;
  if (integrationResponse.ok) {
    const integration = await integrationResponse.json();
    integrationEl.className = `integration ${integration.mode === "not_configured" ? "warning" : "ready"}`;
    const agentMessage = agents.length ? `${agents.length} call agents available` : "agent list unavailable";
    integrationEl.textContent = integration.mode === "not_configured"
      ? "SnapServe is not configured. Add the Render environment variables before placing calls."
      : `SnapServe: ${integration.mode.replaceAll("_", " ")} · ${agentMessage} · Automatic calls ${integration.automaticCalls ? "on" : "off"} · Result webhook ${integration.resultWebhook ? "ready" : "not configured"}`;
  }
  renderStats(); renderOrders(); await loadAnalytics();
  messageEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
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
    const selected = card.querySelector(".agent");
    const selectedOption = selected?.selectedOptions[0];
    const body = isCall ? JSON.stringify({ agentId: selected.value || null, agentName: selected.value ? selectedOption.textContent.split(" · ")[0] : null }) : isRefresh ? undefined : JSON.stringify({ status: card.querySelector(".status").value });
    const response = await fetch(endpoint, { method: (isCall || isRefresh) ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Action failed");
    messageEl.textContent = isCall ? `Call started with ${selectedOption?.textContent || "default agent"}.` : isRefresh ? "Call details refreshed." : "Order status updated.";
    await loadData();
  } catch (error) { messageEl.textContent = error.message; messageEl.className = "error"; }
  finally { event.target.disabled = false; }
});

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(item => item.classList.toggle("active", item === tab));
  document.querySelectorAll(".panel").forEach(panel => { panel.hidden = panel.id !== tab.dataset.panel; });
}));
document.querySelector("#refresh").addEventListener("click", () => loadData().catch(showError));
periodEl.addEventListener("change", () => loadAnalytics().catch(showError));
searchEl.addEventListener("input", renderOrders);
filterEl.addEventListener("change", renderOrders);
function showError(error) { messageEl.textContent = error.message; messageEl.className = "error"; }
loadData().catch(showError);
