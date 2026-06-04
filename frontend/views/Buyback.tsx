import React, { useEffect, useMemo, useState } from "react";
import { createBuyback, createCustomer, listBuybacks, listCustomers, listStores, type ApiBuyback, type ApiCustomer, type ApiStore, type BuybackCondition } from "../services/api";
import type { User } from "../types";
import "./Buyback.css";

const conditions: BuybackCondition[] = ["Excellent", "Good", "Fair", "Poor"];
const checks = ["display_working", "touch_working", "face_id_fingerprint_working", "charging_port_working", "speaker_mic_working", "sim_detection_working", "wifi_bluetooth_working", "network_signal_working"];
const damages = ["water_damage", "cracks", "dead_pixels", "parts_replaced"];
const labels = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (x) => x.toUpperCase());
const initial: any = { customer: "", customerName: "", phone: "", email: "", store: "", brand: "", model: "", imei: "", serial: "", color: "", storage: "", ram: "", battery: "100", condition: "Good", jobNo: "", marketValue: "", conditionDeduction: "0", buybackPrice: "", sellingPrice: "", cash: "", online: "0", exchange: "0", payoutMethod: "cash", rack: "", accessories: "", box: false, charger: false, physical: {}, functional: {}, damage: {}, inspectionNotes: "", pricingNotes: "", notes: "", status: "Processed" };

const Section = ({ title, summary, open, children }: { title: string; summary: string; open?: boolean; children: React.ReactNode }) =>
  <details className="bb-section" open={open}><summary><div><strong>{title}</strong><span>{summary}</span></div><b>+</b></summary><div className="bb-section-body">{children}</div></details>;

const Buyback: React.FC<{ user: User }> = ({ user }) => {
  const [form, setForm] = useState<any>(initial);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [rows, setRows] = useState<ApiBuyback[]>([]);
  const [selected, setSelected] = useState<ApiBuyback | null>(null);
  const [search, setSearch] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [notice, setNotice] = useState({ error: "", success: "" });
  const [saving, setSaving] = useState(false);
  const update = (key: string, value: any) => setForm((old: any) => ({ ...old, [key]: value }));
  const toggleMap = (section: string, key: string) => update(section, { ...form[section], [key]: !form[section][key] });

  const load = async () => {
    const [customerRows, storeRows, buybacks] = await Promise.all([listCustomers(), listStores(), listBuybacks()]);
    const active = storeRows.filter((x) => x.is_active); setCustomers(customerRows); setStores(active); setRows(buybacks);
    update("store", form.store || user.assignedStoreId || active[0]?.id || "");
  };
  useEffect(() => { void load().catch((e) => setNotice({ error: e.message, success: "" })); }, []);

  const finalValuation = Math.max(0, Number(form.marketValue || 0) - Number(form.conditionDeduction || 0));
  const filtered = useMemo(() => rows.filter((row) => `${row.job_no} ${row.imei} ${row.customer_name} ${row.brand} ${row.model}`.toLowerCase().includes(search.toLowerCase()) && (!conditionFilter || row.condition === conditionFilter)), [rows, search, conditionFilter]);

  const save = async (print = false) => {
    try {
      setSaving(true); setNotice({ error: "", success: "" });
      if (!form.customerName.trim() || !form.phone.trim()) throw new Error("Customer name and mobile number are required.");
      if (!form.store || !form.brand.trim() || !form.model.trim()) throw new Error("Store, brand, and model are required.");
      if (!/^\d{15}$/.test(form.imei)) throw new Error("IMEI must contain exactly 15 digits.");
      let customerId = form.customer;
      if (!customerId) customerId = customers.find((x) => x.phone === form.phone)?.id || (await createCustomer({ name: form.customerName, phone: form.phone, email: form.email, store_ref: form.store })).id;
      const created = await createBuyback({
        customer: customerId, store_ref: form.store, brand: form.brand, model: form.model, imei: form.imei, serial_number: form.serial,
        color: form.color, storage: form.storage, ram: form.ram, battery_health: Number(form.battery), condition: form.condition, job_no: form.jobNo || undefined,
        accessories_received: form.accessories.split(",").map((x: string) => x.trim()).filter(Boolean), box_available: form.box, charger_available: form.charger,
        physical_inspection: form.physical, functional_inspection: form.functional, damage_detection: form.damage,
        market_value: String(form.marketValue || form.buybackPrice), condition_deduction: String(form.conditionDeduction), final_valuation: String(finalValuation),
        negotiated_price: String(form.buybackPrice || finalValuation), suggested_resale_price: String(form.sellingPrice || form.marketValue), cash_payout_amount: String(form.cash || form.buybackPrice),
        exchange_credit_amount: String(form.exchange), payout_method: form.payoutMethod, rack_location: form.rack, inspection_notes: form.inspectionNotes, pricing_notes: form.pricingNotes, notes: form.notes, status: form.status,
      });
      setRows((old) => [created, ...old]); setSelected(created); setNotice({ error: "", success: "Buyback saved. Used phone is now available in Inventory and POS." });
      setForm({ ...initial, store: form.store }); window.dispatchEvent(new CustomEvent("inventory:changed"));
      if (print) window.print();
    } catch (e) { setNotice({ error: e instanceof Error ? e.message : "Failed to save buyback", success: "" }); } finally { setSaving(false); }
  };

  return <div className="buyback-page">
    <header className="buyback-header"><div><h1>Buyback Intake</h1><p>Fast essentials first, complete assessment when needed.</p></div><span>{filtered.length} devices</span></header>
    {(notice.error || notice.success) && <p className={`buyback-notice ${notice.error ? "error" : "success"}`}>{notice.error || notice.success}</p>}
    <section className="buyback-toolbar"><input placeholder="Search job, IMEI, customer, brand or model" value={search} onChange={(e) => setSearch(e.target.value)} /><select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value)}><option value="">All Conditions</option>{conditions.map((x) => <option key={x}>{x}</option>)}</select><select value={form.customer} onChange={(e) => { const c = customers.find((x) => x.id === e.target.value); setForm({ ...form, customer: e.target.value, customerName: c?.name || "", phone: c?.phone || "", email: c?.email || "" }); }}><option value="">New Customer</option>{customers.map((x) => <option value={x.id} key={x.id}>{x.name} - {x.phone}</option>)}</select></section>
    <div className="bb-layout"><main>
      <Section title="Essential Details" summary="Customer, device, store and price" open><div className="buyback-grid">{[["customerName","Customer Name"],["phone","Mobile Number"],["email","Email (Optional)"],["brand","Brand"],["model","Model"],["imei","IMEI"],["color","Color"],["storage","Storage"],["ram","RAM"],["jobNo","Job Number"],["buybackPrice","Buyback Price"],["sellingPrice","Selling Price"]].map(([key,label]) => <label key={key}>{label}<input value={form[key]} onChange={(e) => update(key, key === "imei" ? e.target.value.replace(/\D/g,"").slice(0,15) : e.target.value)} /></label>)}<label>Condition<select value={form.condition} onChange={(e) => update("condition",e.target.value)}>{conditions.map((x)=><option key={x}>{x}</option>)}</select></label><label>Store<select value={form.store} onChange={(e)=>update("store",e.target.value)} disabled={user.role!=="Admin"}>{stores.map((x)=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label></div></Section>
      <Section title="Physical Inspection" summary="Screen, body, camera and buttons"><div className="buyback-grid">{["screen_condition","back_panel_condition","frame_body_condition","camera_condition","buttons_condition"].map((key)=><label key={key}>{labels(key)}<select value={form.physical[key]||"good"} onChange={(e)=>update("physical",{...form.physical,[key]:e.target.value})}><option>excellent</option><option>good</option><option>fair</option><option>poor</option></select></label>)}</div></Section>
      <Section title="Functional Inspection" summary="Touch-friendly working checks"><div className="bb-checks">{checks.map((key)=><label key={key} className={form.functional[key]?"checked":""}><input type="checkbox" checked={!!form.functional[key]} onChange={()=>toggleMap("functional",key)}/>{labels(key)}</label>)}</div></Section>
      <Section title="Damage Detection" summary="Record visible or known damage"><div className="bb-checks danger">{damages.map((key)=><label key={key} className={form.damage[key]?"checked":""}><input type="checkbox" checked={!!form.damage[key]} onChange={()=>toggleMap("damage",key)}/>{labels(key)}</label>)}</div></Section>
      <Section title="Accessories Received" summary="Box, charger and included items"><div className="bb-checks"><label className={form.box?"checked":""}><input type="checkbox" checked={form.box} onChange={()=>update("box",!form.box)}/>Box Available</label><label className={form.charger?"checked":""}><input type="checkbox" checked={form.charger} onChange={()=>update("charger",!form.charger)}/>Charger Available</label></div><label className="bb-wide">Other Accessories<input value={form.accessories} onChange={(e)=>update("accessories",e.target.value)} placeholder="Cable, case, invoice..." /></label></Section>
      <Section title="Pricing & Valuation" summary={`Final valuation: Rs ${finalValuation.toLocaleString()}`}><div className="buyback-grid">{[["marketValue","Market Value"],["conditionDeduction","Condition Deduction"],["buybackPrice","Negotiated Buyback Price"],["sellingPrice","Suggested Resale Price"]].map(([key,label])=><label key={key}>{label}<input type="number" value={form[key]} onChange={(e)=>update(key,e.target.value)}/></label>)}</div><div className="bb-value">Final Valuation <strong>Rs {finalValuation.toLocaleString()}</strong></div></Section>
      <Section title="Payout Details" summary="Cash, online, exchange and method"><div className="buyback-grid"><label>Payout Method<select value={form.payoutMethod} onChange={(e)=>update("payoutMethod",e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option><option value="partial">Mixed</option></select></label>{[["cash","Cash Amount"],["online","Online Amount"],["exchange","Exchange Credit"]].map(([key,label])=><label key={key}>{label}<input type="number" value={form[key]} onChange={(e)=>update(key,e.target.value)}/></label>)}</div></Section>
      <Section title="Workflow & Store Assignment" summary="Current stage and inventory destination"><div className="buyback-grid"><label>Workflow Status<select value={form.status} onChange={(e)=>update("status",e.target.value)}><option>Pending</option><option>Accepted</option><option>Processed</option><option>Rejected</option></select></label><label>Assigned Store<select value={form.store} onChange={(e)=>update("store",e.target.value)} disabled={user.role!=="Admin"}>{stores.map((x)=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label><label>Rack Location<input value={form.rack} onChange={(e)=>update("rack",e.target.value)}/></label></div><p className="bb-help">The assigned store controls where the used phone appears in Inventory and POS.</p></Section>
      <Section title="Assignment & Notes" summary="Rack location and complete notes"><div className="buyback-grid"><label>Rack Location<input value={form.rack} onChange={(e)=>update("rack",e.target.value)}/></label><label>Battery Health<input type="number" min="0" max="100" value={form.battery} onChange={(e)=>update("battery",e.target.value)}/></label><label>Serial Number<input value={form.serial} onChange={(e)=>update("serial",e.target.value)}/></label><label className="wide">Inspection Notes<textarea value={form.inspectionNotes} onChange={(e)=>update("inspectionNotes",e.target.value)}/></label><label className="wide">Pricing Notes<textarea value={form.pricingNotes} onChange={(e)=>update("pricingNotes",e.target.value)}/></label><label className="wide">General Notes<textarea value={form.notes} onChange={(e)=>update("notes",e.target.value)}/></label></div></Section>
      <div className="buyback-actions"><button onClick={()=>setForm({...initial,store:form.store})}>Cancel</button><button onClick={()=>void save(true)} disabled={saving}>Save & Print</button><button className="primary" onClick={()=>void save()} disabled={saving}>{saving?"Saving...":"Save Buyback"}</button></div>
    </main><aside className="bb-side"><h2>Device History</h2>{selected?<><div className="bb-selected"><span className="used-tag">USED PHONE</span><h3>{selected.brand} {selected.model}</h3><p>{selected.job_no || selected.imei}</p><dl><div><dt>Condition</dt><dd>{selected.condition}</dd></div><div><dt>Store</dt><dd>{stores.find((x)=>x.id===selected.store_ref)?.name||"-"}</dd></div><div><dt>Buyback</dt><dd>Rs {Number(selected.negotiated_price).toLocaleString()}</dd></div><div><dt>Created</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div></dl></div></>:<p className="empty">Select a device below to view its history.</p>}<h2>Recent Buybacks</h2><div className="bb-recent">{filtered.slice(0,12).map((row)=><button key={row.id} onClick={()=>setSelected(row)}><strong>{row.brand} {row.model}</strong><span>{row.job_no||row.imei} · {row.condition}</span></button>)}</div></aside></div>
  </div>;
};
export default Buyback;
