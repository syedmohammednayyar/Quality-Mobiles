import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, isPrivilegedUser } from '../types';
import {
  createBuyback,
  createCustomer,
  deleteBuyback,
  listBuybacksPage,
  listCustomers,
  listEmployees,
  listStores,
  updateBuyback,
  type ApiBuyback,
  type ApiCustomer,
  type ApiEmployee,
  type ApiStore,
  type BuybackCondition,
  type BuybackFunctionalInspection,
  type BuybackInspectionSection,
  type BuybackDamageDetection,
  type BuybackWorkflowStatus,
  type CreateBuybackPayload,
} from '../services/api';
import './Buyback.css';

type BuybackFormState = {
  imei: string;
  serial_number: string;
  customer: string;
  store_ref: string;
  assigned_store_ref: string;
  assigned_technician: string;
  brand: string;
  model: string;
  variant: string;
  color: string;
  storage: string;
  ram: string;
  battery_health: string;
  accessories_received: string;
  box_available: boolean;
  charger_available: boolean;
  physical_inspection: BuybackInspectionSection;
  functional_inspection: BuybackFunctionalInspection;
  damage_detection: BuybackDamageDetection;
  condition: BuybackCondition;
  market_value: string;
  condition_deduction: string;
  repair_deduction: string;
  final_valuation: string;
  negotiated_price: string;
  exchange_credit_amount: string;
  cash_payout_amount: string;
  suggested_resale_price: string;
  expected_profit_margin: string;
  exchange_credit_enabled: boolean;
  payout_method: 'cash' | 'bank_transfer' | 'upi' | 'partial';
  linked_sale_id: string;
  rack_location: string;
  notes: string;
  inspection_notes: string;
  pricing_notes: string;
  repair_notes: string;
  resale_notes: string;
};

type FilterState = {
  search: string;
  status: BuybackWorkflowStatus | '';
  store_id: string;
  assigned_technician_id: string;
  from: string;
  to: string;
  sort_by: 'created_at' | 'updated_at' | 'imei' | 'negotiated_price' | 'market_value' | 'final_valuation' | 'status';
  sort_dir: 'asc' | 'desc';
  page: number;
  limit: number;
};

const workflowOrder: BuybackWorkflowStatus[] = [
  'pending_inspection',
  'inspection_completed',
  'approved',
  'repair_pending',
  'repair_in_progress',
  'repair_completed',
  'ready_for_resale',
  'reserved',
  'sold',
];

const workflowLabels: Record<BuybackWorkflowStatus, string> = {
  pending_inspection: 'Pending Inspection',
  inspection_completed: 'Inspection Completed',
  approved: 'Approved',
  rejected: 'Rejected',
  repair_pending: 'Repair Pending',
  repair_in_progress: 'Repair In Progress',
  repair_completed: 'Repair Completed',
  ready_for_resale: 'Ready For Resale',
  reserved: 'Reserved',
  sold: 'Sold',
};

const workflowNextMap: Record<BuybackWorkflowStatus, BuybackWorkflowStatus[]> = {
  pending_inspection: ['inspection_completed', 'rejected'],
  inspection_completed: ['approved', 'repair_pending', 'rejected'],
  approved: ['repair_pending', 'repair_in_progress', 'ready_for_resale', 'reserved'],
  rejected: [],
  repair_pending: ['repair_in_progress', 'rejected'],
  repair_in_progress: ['repair_completed', 'rejected'],
  repair_completed: ['ready_for_resale'],
  ready_for_resale: ['reserved', 'sold'],
  reserved: ['sold'],
  sold: [],
};

const conditionOptions: BuybackCondition[] = ['Excellent', 'Good', 'Fair', 'Poor'];
const payoutOptions: BuybackFormState['payout_method'][] = ['cash', 'bank_transfer', 'upi', 'partial'];

const initialForm: BuybackFormState = {
  imei: '',
  serial_number: '',
  customer: '',
  store_ref: '',
  assigned_store_ref: '',
  assigned_technician: '',
  brand: '',
  model: '',
  variant: '',
  color: '',
  storage: '',
  ram: '',
  battery_health: '100',
  accessories_received: '',
  box_available: false,
  charger_available: false,
  physical_inspection: {
    screen_condition: 'unknown',
    back_panel_condition: 'unknown',
    frame_body_condition: 'unknown',
    camera_condition: 'unknown',
    buttons_condition: 'unknown',
  },
  functional_inspection: {
    display_working: false,
    touch_working: false,
    face_id_fingerprint_working: false,
    charging_port_working: false,
    speaker_mic_working: false,
    sim_detection_working: false,
    wifi_bluetooth_working: false,
    network_signal_working: false,
  },
  damage_detection: {
    water_damage: false,
    cracks: false,
    dead_pixels: false,
    previously_repaired: false,
    parts_replaced: false,
  },
  condition: 'Good',
  market_value: '0',
  condition_deduction: '0',
  repair_deduction: '0',
  final_valuation: '0',
  negotiated_price: '0',
  exchange_credit_amount: '0',
  cash_payout_amount: '0',
  suggested_resale_price: '0',
  expected_profit_margin: '0',
  exchange_credit_enabled: false,
  payout_method: 'cash',
  linked_sale_id: '',
  rack_location: '',
  notes: '',
  inspection_notes: '',
  pricing_notes: '',
  repair_notes: '',
  resale_notes: '',
};

const initialFilters: FilterState = {
  search: '',
  status: '',
  store_id: '',
  assigned_technician_id: '',
  from: '',
  to: '',
  sort_by: 'created_at',
  sort_dir: 'desc',
  page: 1,
  limit: 10,
};

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function money(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyText(value: unknown): string {
  return money(value).toLocaleString();
}

function badgeClassForWorkflow(status: BuybackWorkflowStatus): string {
  return `status-badge workflow-${status}`;
}

function badgeClassForCondition(condition: BuybackCondition): string {
  return `condition-badge condition-${condition.toLowerCase()}`;
}

function parseAccessories(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseMoneyString(value: string): string {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
}

function emptyLookup<T extends { id: string }>(values: T[]): Map<string, T> {
  const map = new Map<string, T>();
  values.forEach((entry) => map.set(entry.id, entry));
  return map;
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function getRowTitle(item: ApiBuyback): string {
  return `${item.brand || 'Unknown'} ${item.model || ''}`.trim();
}

const Buyback = ({ user }: { user: User }) => {
  const isAdmin = user.role === 'Admin';
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('q') || '';
  const initialStore = searchParams.get('store') || user.assignedStoreId || '';

  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [buybacks, setBuybacks] = useState<ApiBuyback[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState<FilterState>({ ...initialFilters, search: initialSearch, store_id: initialStore, page: 1 });
  const [form, setForm] = useState<BuybackFormState>({ ...initialForm, store_ref: initialStore });
  const [customerDraft, setCustomerDraft] = useState({ name: '', phone: '', email: '' });
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [transferStoreId, setTransferStoreId] = useState('');

  const debouncedSearch = useDebouncedValue(filters.search, 300);

  useEffect(() => {
    const loadLookups = async () => {
      try {
        setLoadingLookups(true);
        const [customerRows, storeRows, employeeRows] = await Promise.all([
          listCustomers(),
          listStores(),
          listEmployees(),
        ]);
        setCustomers(customerRows);
        setStores(storeRows.filter((store) => store.is_active));
        setEmployees(employeeRows);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load buyback lookups');
      } finally {
        setLoadingLookups(false);
      }
    };

    void loadLookups();
  }, []);

  useEffect(() => {
    if (!filters.store_id && initialStore && stores.length > 0) {
      const matchedStore = stores.find((store) => store.id === initialStore || store.name.toLowerCase() === initialStore.toLowerCase());
      if (matchedStore) {
        setFilters((prev) => ({ ...prev, store_id: matchedStore.id }));
        setForm((prev) => ({ ...prev, store_ref: matchedStore.id, assigned_store_ref: matchedStore.id }));
      }
    }
  }, [filters.store_id, initialStore, stores]);

  useEffect(() => {
    const loadRows = async () => {
      try {
        setLoadingRows(true);
        setError('');
        const result = await listBuybacksPage({
          search: debouncedSearch || undefined,
          status: filters.status || undefined,
          store_id: filters.store_id || undefined,
          assigned_technician_id: filters.assigned_technician_id || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          page: filters.page,
          limit: filters.limit,
          sort_by: filters.sort_by,
          sort_dir: filters.sort_dir,
        });
        setBuybacks(result.rows);
        if (result.pagination) {
          setPagination(result.pagination);
        } else {
          setPagination((prev) => ({ ...prev, total: result.rows.length, totalPages: 1 }));
        }
        if (!selectedRowId && result.rows.length > 0) {
          setSelectedRowId(result.rows[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load buybacks');
      } finally {
        setLoadingRows(false);
      }
    };

    void loadRows();
  }, [debouncedSearch, filters.assigned_technician_id, filters.from, filters.limit, filters.page, filters.sort_by, filters.sort_dir, filters.status, filters.store_id]);

  const customerMap = useMemo(() => emptyLookup(customers), [customers]);
  const storeMap = useMemo(() => emptyLookup(stores), [stores]);
  const employeeMap = useMemo(() => emptyLookup(employees), [employees]);

  const selectedRow = useMemo(() => buybacks.find((entry) => entry.id === selectedRowId) || buybacks[0] || null, [buybacks, selectedRowId]);
  const selectedCustomer = useMemo(() => customerMap.get(form.customer), [customerMap, form.customer]);
  const selectedStore = useMemo(() => storeMap.get(form.store_ref), [storeMap, form.store_ref]);
  const selectedTechnician = useMemo(() => employeeMap.get(form.assigned_technician), [employeeMap, form.assigned_technician]);

  const customerHistory = useMemo(() => {
    if (!form.customer) return [];
    return buybacks.filter((entry) => entry.customer === form.customer).slice(0, 5);
  }, [buybacks, form.customer]);

  const metrics = useMemo(() => {
    const total = buybacks.length;
    const approved = buybacks.filter((entry) => entry.status_key === 'approved' || entry.status_key === 'ready_for_resale' || entry.status_key === 'sold').length;
    const pending = buybacks.filter((entry) => entry.status_key === 'pending_inspection' || entry.status_key === 'inspection_completed').length;
    const sold = buybacks.filter((entry) => entry.status_key === 'sold').length;
    const profit = buybacks.reduce((sum, entry) => sum + money(entry.suggested_resale_price) - money(entry.final_valuation), 0);
    return { total, approved, pending, sold, profit };
  }, [buybacks]);

  const pricingPreview = useMemo(() => {
    const market = money(form.market_value);
    const conditionDeduction = money(form.condition_deduction);
    const repairDeduction = money(form.repair_deduction);
    const finalValuation = Math.max(0, market - conditionDeduction - repairDeduction);
    const negotiated = money(form.negotiated_price) || finalValuation;
    const exchangeCredit = money(form.exchange_credit_amount);
    const cashPayout = money(form.cash_payout_amount) || Math.max(0, negotiated - exchangeCredit);
    const suggestedResale = money(form.suggested_resale_price) || Math.max(0, finalValuation * 1.18);
    const profitMargin = finalValuation > 0 ? ((suggestedResale - finalValuation) / finalValuation) * 100 : 0;
    return {
      finalValuation,
      negotiated,
      exchangeCredit,
      cashPayout,
      suggestedResale,
      profitMargin,
    };
  }, [form.cash_payout_amount, form.condition_deduction, form.exchange_credit_amount, form.market_value, form.negotiated_price, form.repair_deduction, form.suggested_resale_price]);

  const nextStatuses = useMemo(() => {
    if (!selectedRow) return [] as BuybackWorkflowStatus[];
    return workflowNextMap[selectedRow.status_key as BuybackWorkflowStatus] || [];
  }, [selectedRow]);

  const selectedRowStore = useMemo(() => {
    if (!selectedRow) return null;
    return storeMap.get(selectedRow.assigned_store_ref || selectedRow.store_ref || '') || null;
  }, [selectedRow, storeMap]);

  const selectedRowTechnician = useMemo(() => {
    if (!selectedRow) return null;
    return employeeMap.get(selectedRow.assigned_technician || '') || null;
  }, [employeeMap, selectedRow]);

  const resetForm = () => {
    setForm({ ...initialForm, store_ref: filters.store_id || initialStore, assigned_store_ref: filters.store_id || initialStore });
  };

  const updateForm = <K extends keyof BuybackFormState>(key: K, value: BuybackFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateInspection = (section: 'physical_inspection' | 'functional_inspection' | 'damage_detection', key: string, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const refreshRows = async (nextPage = filters.page) => {
    setFilters((prev) => ({ ...prev, page: nextPage }));
  };

  const handleCreateCustomer = async () => {
    if (!customerDraft.name.trim()) {
      setError('Customer name is required');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const created = await createCustomer({
        name: customerDraft.name.trim(),
        phone: customerDraft.phone.trim(),
        email: customerDraft.email.trim(),
        store_ref: form.store_ref || undefined,
      });
      setCustomers((prev) => [created, ...prev]);
      updateForm('customer', created.id);
      setCustomerDraft({ name: '', phone: '', email: '' });
      setMessage('Customer created and linked to the buyback form.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateBuyback = async () => {
    if (!form.customer) {
      setError('Select a customer before creating a buyback');
      return;
    }
    if (!form.store_ref) {
      setError('Select a store before creating a buyback');
      return;
    }
    if (!/^\d{15}$/.test(form.imei)) {
      setError('IMEI must contain exactly 15 digits');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const payload: CreateBuybackPayload = {
        imei: form.imei,
        serial_number: form.serial_number.trim() || undefined,
        customer: form.customer,
        store_ref: form.store_ref,
        assigned_store_ref: form.assigned_store_ref || undefined,
        assigned_technician: form.assigned_technician || undefined,
        brand: form.brand.trim(),
        model: form.model.trim(),
        variant: form.variant.trim() || undefined,
        color: form.color.trim() || undefined,
        storage: form.storage.trim() || undefined,
        ram: form.ram.trim() || undefined,
        battery_health: Number(form.battery_health || 0),
        accessories_received: parseAccessories(form.accessories_received),
        box_available: form.box_available,
        charger_available: form.charger_available,
        physical_inspection: form.physical_inspection,
        functional_inspection: form.functional_inspection,
        damage_detection: form.damage_detection,
        condition: form.condition,
        market_value: parseMoneyString(form.market_value),
        condition_deduction: parseMoneyString(form.condition_deduction),
        repair_deduction: parseMoneyString(form.repair_deduction),
        final_valuation: parseMoneyString(pricingPreview.finalValuation.toFixed(2)),
        negotiated_price: parseMoneyString(form.negotiated_price || pricingPreview.negotiated.toFixed(2)),
        exchange_credit_amount: parseMoneyString(form.exchange_credit_amount),
        cash_payout_amount: parseMoneyString(form.cash_payout_amount || pricingPreview.cashPayout.toFixed(2)),
        suggested_resale_price: parseMoneyString(form.suggested_resale_price || pricingPreview.suggestedResale.toFixed(2)),
        expected_profit_margin: pricingPreview.profitMargin.toFixed(2),
        exchange_credit_enabled: form.exchange_credit_enabled,
        payout_method: form.payout_method,
        linked_sale_id: form.linked_sale_id.trim() || undefined,
        rack_location: form.rack_location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        inspection_notes: form.inspection_notes.trim() || undefined,
        pricing_notes: form.pricing_notes.trim() || undefined,
        repair_notes: form.repair_notes.trim() || undefined,
        resale_notes: form.resale_notes.trim() || undefined,
      };
      const created = await createBuyback(payload);
      setBuybacks((prev) => [created, ...prev]);
      setSelectedRowId(created.id);
      setExpandedRowId(created.id);
      resetForm();
      setMessage('Buyback created successfully.');
      await refreshRows(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create buyback');
    } finally {
      setSubmitting(false);
    }
  };

  const applyRowUpdate = async (item: ApiBuyback, patch: Partial<CreateBuybackPayload> & { status?: BuybackWorkflowStatus }) => {
    try {
      setSubmitting(true);
      setError('');
      const updated = await updateBuyback(item.id, patch);
      setBuybacks((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setSelectedRowId(updated.id);
      setMessage(`Buyback moved to ${updated.status}.`);
      await refreshRows(filters.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update buyback');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransition = async (item: ApiBuyback, nextStatus: BuybackWorkflowStatus) => {
    await applyRowUpdate(item, { status: nextStatus });
  };

  const handleTransfer = async (item: ApiBuyback) => {
    if (!transferStoreId) {
      setError('Select a destination store first');
      return;
    }
    await applyRowUpdate(item, {
      assigned_store_ref: transferStoreId,
      status: item.status_key,
    });
  };

  const handleDelete = async (item: ApiBuyback) => {
    try {
      setSubmitting(true);
      setError('');
      await deleteBuyback(item.id);
      setBuybacks((prev) => prev.filter((entry) => entry.id !== item.id));
      setExpandedRowId((prev) => (prev === item.id ? null : prev));
      setSelectedRowId((prev) => (prev === item.id ? null : prev));
      setMessage('Buyback archived successfully.');
      await refreshRows(filters.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete buyback');
    } finally {
      setSubmitting(false);
    }
  };

  const exportCsv = () => {
    const headers = [
      'Buyback ID', 'IMEI', 'Customer', 'Device model', 'Condition', 'Buyback price', 'Resale price', 'Profit margin', 'Repair status', 'Workflow status', 'Assigned store', 'Technician', 'Buyback date', 'Last updated',
    ];
    const lines = [headers.join(',')];
    buybacks.forEach((entry) => {
      lines.push([
        entry.id,
        entry.imei,
        JSON.stringify(entry.customer_name || customerMap.get(entry.customer || '')?.name || 'Walk-in'),
        JSON.stringify(getRowTitle(entry)),
        entry.condition,
        entry.negotiated_price,
        entry.suggested_resale_price || '',
        String(entry.expected_profit_margin || ''),
        entry.repair_notes || '',
        entry.status,
        JSON.stringify(entry.assigned_store_name || storeMap.get(entry.assigned_store_ref || entry.store_ref || '')?.name || ''),
        JSON.stringify(entry.assigned_technician_name || employeeMap.get(entry.assigned_technician || '')?.name || ''),
        JSON.stringify(entry.created_at),
        JSON.stringify(entry.updated_at || entry.created_at),
      ].join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `buybacks-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!printWindow) {
      setError('Unable to open print window for PDF export');
      return;
    }

    const rowsMarkup = buybacks.map((entry) => `
      <tr>
        <td>${entry.id}</td>
        <td>${entry.imei}</td>
        <td>${entry.customer_name || customerMap.get(entry.customer || '')?.name || 'Walk-in'}</td>
        <td>${getRowTitle(entry)}</td>
        <td>${entry.condition}</td>
        <td>${entry.negotiated_price}</td>
        <td>${entry.suggested_resale_price || ''}</td>
        <td>${entry.status}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Buyback Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
            h1 { margin: 0 0 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Buyback Operations Report</h1>
          <p>Generated ${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th>Buyback ID</th><th>IMEI</th><th>Customer</th><th>Device model</th><th>Condition</th><th>Buyback price</th><th>Resale price</th><th>Workflow status</th>
              </tr>
            </thead>
            <tbody>${rowsMarkup}</tbody>
          </table>
          <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 250); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const currentPageLabel = pagination.totalPages > 0 ? `${pagination.page} / ${pagination.totalPages}` : '1 / 1';

  return (
    <div className="buyback-page-shell">
      <section className="buyback-hero card">
        <div className="buyback-hero-copy">
          <span className="eyebrow">Buyback Operations</span>
          <h1>Serialized trade-in workflow for multi-store mobile operations</h1>
          <p>
            Track every device from intake and inspection to repair, resale, and audit logging without mixing it into normal stock.
          </p>
        </div>
        <div className="buyback-hero-metrics">
          <div className="hero-metric">
            <span>Open Requests</span>
            <strong>{metrics.total}</strong>
          </div>
          <div className="hero-metric">
            <span>Pending Review</span>
            <strong>{metrics.pending}</strong>
          </div>
          <div className="hero-metric">
            <span>Approved / Resale Ready</span>
            <strong>{metrics.approved}</strong>
          </div>
          <div className="hero-metric">
            <span>Estimated Margin</span>
            <strong>Rs {metrics.profit.toLocaleString()}</strong>
          </div>
        </div>
      </section>

      {(error || message) && (
        <div className={`buyback-banner ${error ? 'buyback-banner-error' : 'buyback-banner-success'}`}>
          {error || message}
        </div>
      )}

      {!isAdmin && (
      <div className="buyback-layout">
        <div className="buyback-main-column">
          <section className="buyback-panel card">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Section 1</span>
                <h2>Customer Information</h2>
              </div>
              <span className="panel-caption">Existing customer search, quick create, and buyback history preview</span>
            </div>

            <div className="panel-grid panel-grid-2">
              <div className="field-block">
                <label>Existing Customer</label>
                <select className="form-input" value={form.customer} onChange={(event) => updateForm('customer', event.target.value)}>
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone || 'No phone'}</option>
                  ))}
                </select>
              </div>
              <div className="field-block">
                <label>Customer Type / Loyalty</label>
                <div className="status-chip-row">
                  <span className="status-chip status-chip-teal">{selectedCustomer ? 'Returning customer' : 'Walk-in'}</span>
                  <span className="status-chip status-chip-neutral">{selectedCustomer?.phone ? 'Phone verified' : 'Needs verification'}</span>
                </div>
              </div>
            </div>

            <div className="panel-grid panel-grid-3">
              <div className="field-block">
                <label>New Customer Name</label>
                <input className="form-input" value={customerDraft.name} onChange={(event) => setCustomerDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Customer name" />
              </div>
              <div className="field-block">
                <label>New Customer Phone</label>
                <input className="form-input" value={customerDraft.phone} onChange={(event) => setCustomerDraft((prev) => ({ ...prev, phone: event.target.value.replace(/[^0-9+\- ]/g, '') }))} placeholder="Phone number" />
              </div>
              <div className="field-block">
                <label>New Customer Email</label>
                <input className="form-input" value={customerDraft.email} onChange={(event) => setCustomerDraft((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email address" />
              </div>
            </div>

            <div className="panel-actions-row">
              <button className="btn btn-secondary" disabled={submitting || loadingLookups} onClick={() => void handleCreateCustomer()}>
                Create Customer
              </button>
              <div className="inline-meta">
                <span>Selected: {selectedCustomer?.name || 'None'}</span>
                <span>{selectedCustomer?.phone || 'No phone on file'}</span>
              </div>
            </div>

            <div className="history-strip">
              <h3>Customer History Preview</h3>
              {customerHistory.length > 0 ? (
                <div className="history-list">
                  {customerHistory.map((entry) => (
                    <article key={entry.id} className="history-card">
                      <div>
                        <strong>{entry.imei}</strong>
                        <p>{getRowTitle(entry)} · {entry.condition}</p>
                      </div>
                      <span className={badgeClassForWorkflow(entry.status_key)}>{entry.status}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-slate">No previous buybacks for the selected customer.</div>
              )}
            </div>
          </section>

          <section className="buyback-panel card">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Section 2</span>
                <h2>Device Details</h2>
              </div>
              <span className="panel-caption">Serialized assets only. No quantity stock logic.</span>
            </div>

            <div className="panel-grid panel-grid-3">
              <div className="field-block"><label>Brand</label><input className="form-input" value={form.brand} onChange={(event) => updateForm('brand', event.target.value)} placeholder="Apple" /></div>
              <div className="field-block"><label>Model</label><input className="form-input" value={form.model} onChange={(event) => updateForm('model', event.target.value)} placeholder="iPhone 13" /></div>
              <div className="field-block"><label>Variant</label><input className="form-input" value={form.variant} onChange={(event) => updateForm('variant', event.target.value)} placeholder="Pro Max" /></div>
              <div className="field-block"><label>Color</label><input className="form-input" value={form.color} onChange={(event) => updateForm('color', event.target.value)} placeholder="Midnight" /></div>
              <div className="field-block"><label>Storage</label><input className="form-input" value={form.storage} onChange={(event) => updateForm('storage', event.target.value)} placeholder="256GB" /></div>
              <div className="field-block"><label>RAM</label><input className="form-input" value={form.ram} onChange={(event) => updateForm('ram', event.target.value)} placeholder="8GB" /></div>
              <div className="field-block"><label>IMEI</label><input className="form-input monospace" value={form.imei} onChange={(event) => updateForm('imei', event.target.value.replace(/\D/g, '').slice(0, 15))} maxLength={15} placeholder="15-digit IMEI" /></div>
              <div className="field-block"><label>Serial Number</label><input className="form-input monospace" value={form.serial_number} onChange={(event) => updateForm('serial_number', event.target.value)} placeholder="Serial number" /></div>
              <div className="field-block"><label>Battery Health</label><input className="form-input" value={form.battery_health} onChange={(event) => updateForm('battery_health', event.target.value.replace(/[^0-9]/g, ''))} placeholder="100" /></div>
            </div>

            <div className="panel-grid panel-grid-2">
              <div className="field-block">
                <label>Accessories Received</label>
                <input className="form-input" value={form.accessories_received} onChange={(event) => updateForm('accessories_received', event.target.value)} placeholder="Charger, Cable, Case" />
              </div>
              <div className="field-block">
                <label>Device Packaging</label>
                <div className="status-chip-row">
                  <label className="check-chip"><input type="checkbox" checked={form.box_available} onChange={(event) => updateForm('box_available', event.target.checked)} /> Box available</label>
                  <label className="check-chip"><input type="checkbox" checked={form.charger_available} onChange={(event) => updateForm('charger_available', event.target.checked)} /> Charger available</label>
                </div>
              </div>
            </div>
          </section>

          <section className="buyback-panel card">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Section 3</span>
                <h2>Condition Assessment</h2>
              </div>
              <span className="panel-caption">Physical, functional, and damage detection with visual grading.</span>
            </div>

            <div className="assessment-grid">
              <div className="assessment-card">
                <h3>Physical Inspection</h3>
                <div className="panel-grid panel-grid-2">
                  <div className="field-block"><label>Screen</label><select className="form-input" value={form.physical_inspection.screen_condition || 'unknown'} onChange={(event) => updateInspection('physical_inspection', 'screen_condition', event.target.value)}><option value="unknown">Unknown</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></div>
                  <div className="field-block"><label>Back Panel</label><select className="form-input" value={form.physical_inspection.back_panel_condition || 'unknown'} onChange={(event) => updateInspection('physical_inspection', 'back_panel_condition', event.target.value)}><option value="unknown">Unknown</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></div>
                  <div className="field-block"><label>Frame / Body</label><select className="form-input" value={form.physical_inspection.frame_body_condition || 'unknown'} onChange={(event) => updateInspection('physical_inspection', 'frame_body_condition', event.target.value)}><option value="unknown">Unknown</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></div>
                  <div className="field-block"><label>Camera</label><select className="form-input" value={form.physical_inspection.camera_condition || 'unknown'} onChange={(event) => updateInspection('physical_inspection', 'camera_condition', event.target.value)}><option value="unknown">Unknown</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></div>
                  <div className="field-block"><label>Buttons</label><select className="form-input" value={form.physical_inspection.buttons_condition || 'unknown'} onChange={(event) => updateInspection('physical_inspection', 'buttons_condition', event.target.value)}><option value="unknown">Unknown</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></div>
                </div>
              </div>

              <div className="assessment-card">
                <h3>Functional Inspection</h3>
                <div className="toggle-grid">
                  {[
                    ['display_working', 'Display working'],
                    ['touch_working', 'Touch working'],
                    ['face_id_fingerprint_working', 'Face ID / Fingerprint'],
                    ['charging_port_working', 'Charging port'],
                    ['speaker_mic_working', 'Speaker / Mic'],
                    ['sim_detection_working', 'SIM detection'],
                    ['wifi_bluetooth_working', 'Wi-Fi / Bluetooth'],
                    ['network_signal_working', 'Network signal'],
                  ].map(([key, label]) => (
                    <label key={key} className="check-chip check-chip-wide">
                      <input type="checkbox" checked={Boolean(form.functional_inspection[key as keyof BuybackFunctionalInspection])} onChange={(event) => updateInspection('functional_inspection', key, event.target.checked)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="assessment-card">
                <h3>Damage Detection</h3>
                <div className="toggle-grid">
                  {[
                    ['water_damage', 'Water damage'],
                    ['cracks', 'Cracks'],
                    ['dead_pixels', 'Dead pixels'],
                    ['previously_repaired', 'Repaired previously'],
                    ['parts_replaced', 'Parts replaced'],
                  ].map(([key, label]) => (
                    <label key={key} className="check-chip check-chip-wide">
                      <input type="checkbox" checked={Boolean(form.damage_detection[key as keyof BuybackDamageDetection])} onChange={(event) => updateInspection('damage_detection', key, event.target.checked)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="assessment-card condition-summary-card">
                <h3>Final Condition Grade</h3>
                <select className="form-input" value={form.condition} onChange={(event) => updateForm('condition', event.target.value as BuybackCondition)}>
                  {conditionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <div className={badgeClassForCondition(form.condition)}>{form.condition}</div>
                <p className="condition-summary">Grade drives the deductions and resale margin calculations.</p>
              </div>
            </div>
          </section>

          <section className="buyback-panel card">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Section 4</span>
                <h2>Buyback Pricing</h2>
              </div>
              <span className="panel-caption">Pricing can be reviewed by managers before approval.</span>
            </div>

            <div className="pricing-grid">
              <div className="pricing-card">
                <label>Estimated Market Price</label>
                <input className="form-input" value={form.market_value} onChange={(event) => updateForm('market_value', event.target.value.replace(/[^0-9.]/g, ''))} />
              </div>
              <div className="pricing-card">
                <label>Condition Deduction</label>
                <input className="form-input" value={form.condition_deduction} onChange={(event) => updateForm('condition_deduction', event.target.value.replace(/[^0-9.]/g, ''))} />
              </div>
              <div className="pricing-card">
                <label>Repair Deduction</label>
                <input className="form-input" value={form.repair_deduction} onChange={(event) => updateForm('repair_deduction', event.target.value.replace(/[^0-9.]/g, ''))} />
              </div>
              <div className="pricing-card pricing-card-highlight">
                <label>Final Valuation</label>
                <div className="pricing-value">Rs {pricingPreview.finalValuation.toLocaleString()}</div>
              </div>
              <div className="pricing-card">
                <label>Negotiated Amount</label>
                <input className="form-input" value={form.negotiated_price} onChange={(event) => updateForm('negotiated_price', event.target.value.replace(/[^0-9.]/g, ''))} />
              </div>
              <div className="pricing-card">
                <label>Exchange Credit Amount</label>
                <input className="form-input" value={form.exchange_credit_amount} onChange={(event) => updateForm('exchange_credit_amount', event.target.value.replace(/[^0-9.]/g, ''))} />
              </div>
              <div className="pricing-card">
                <label>Cash Payout Amount</label>
                <input className="form-input" value={form.cash_payout_amount} onChange={(event) => updateForm('cash_payout_amount', event.target.value.replace(/[^0-9.]/g, ''))} />
              </div>
              <div className="pricing-card">
                <label>Suggested Resale Price</label>
                <input className="form-input" value={form.suggested_resale_price} onChange={(event) => updateForm('suggested_resale_price', event.target.value.replace(/[^0-9.]/g, ''))} />
              </div>
              <div className="pricing-card pricing-card-highlight">
                <label>Expected Profit Margin</label>
                <div className="pricing-value">{pricingPreview.profitMargin.toFixed(2)}%</div>
              </div>
            </div>

            <div className="panel-grid panel-grid-2">
              <div className="field-block">
                <label>Exchange Credit</label>
                <label className="check-chip">
                  <input type="checkbox" checked={form.exchange_credit_enabled} onChange={(event) => updateForm('exchange_credit_enabled', event.target.checked)} /> Apply as exchange credit
                </label>
              </div>
              <div className="field-block">
                <label>Payout Method</label>
                <select className="form-input" value={form.payout_method} onChange={(event) => updateForm('payout_method', event.target.value as BuybackFormState['payout_method'])}>
                  {payoutOptions.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="buyback-panel card">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Section 5</span>
                <h2>Workflow Management</h2>
              </div>
              <span className="panel-caption">Transitions are guarded by the backend.</span>
            </div>

            <div className="timeline-shell">
              {workflowOrder.map((status, index) => {
                const active = selectedRow?.status_key === status;
                const completed = selectedRow ? workflowOrder.indexOf(selectedRow.status_key) > index : false;
                return (
                  <div key={status} className={`timeline-step ${active ? 'active' : ''} ${completed ? 'completed' : ''}`}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{workflowLabels[status]}</strong>
                      <p>{index === 0 ? 'Device intake' : index === workflowOrder.length - 1 ? 'Terminal status' : 'Controlled stage transition'}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="workflow-actions-grid">
              {selectedRow ? (
                nextStatuses.length > 0 ? nextStatuses.map((status) => (
                  <button key={status} className="btn btn-secondary" disabled={submitting} onClick={() => void handleTransition(selectedRow, status)}>
                    Move to {workflowLabels[status]}
                  </button>
                )) : (
                  <div className="empty-slate">No valid forward transitions available from the current workflow status.</div>
                )
              ) : (
                <div className="empty-slate">Select a buyback row to manage its workflow.</div>
              )}
            </div>
          </section>

          <section className="buyback-panel card">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Section 6</span>
                <h2>Store & Inventory Control</h2>
              </div>
              <span className="panel-caption">Store assignment, rack location, repair tracking, and aging info.</span>
            </div>

            <div className="panel-grid panel-grid-3">
              <div className="field-block">
                <label>Current Store Assignment</label>
                <select className="form-input" value={form.store_ref} onChange={(event) => updateForm('store_ref', event.target.value)}>
                  <option value="">Select store</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </div>
              <div className="field-block">
                <label>Assigned Store</label>
                <select className="form-input" value={form.assigned_store_ref} onChange={(event) => updateForm('assigned_store_ref', event.target.value)}>
                  <option value="">Same as current store</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </div>
              <div className="field-block">
                <label>Assigned Technician</label>
                <select className="form-input" value={form.assigned_technician} onChange={(event) => updateForm('assigned_technician', event.target.value)}>
                  <option value="">Select technician</option>
                  {employees.filter((employee) => employee.role === 'Technician').map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
              </div>
              <div className="field-block"><label>Rack / Shelf Location</label><input className="form-input" value={form.rack_location} onChange={(event) => updateForm('rack_location', event.target.value)} placeholder="Rack B / Shelf 3" /></div>
              <div className="field-block"><label>Linked Sale ID</label><input className="form-input monospace" value={form.linked_sale_id} onChange={(event) => updateForm('linked_sale_id', event.target.value)} placeholder="Optional POS sale link" /></div>
              <div className="field-block"><label>Inventory Age</label><div className="read-only-chip">Aging is tracked in the list table</div></div>
            </div>
          </section>

          <section className="buyback-panel card">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Operations</span>
                <h2>Source Notes</h2>
              </div>
              <span className="panel-caption">Capture operational notes that auditors can follow later.</span>
            </div>

            <div className="panel-grid panel-grid-2">
              <div className="field-block"><label>Inspection Notes</label><textarea className="form-input form-textarea" value={form.inspection_notes} onChange={(event) => updateForm('inspection_notes', event.target.value)} /></div>
              <div className="field-block"><label>Pricing Notes</label><textarea className="form-input form-textarea" value={form.pricing_notes} onChange={(event) => updateForm('pricing_notes', event.target.value)} /></div>
              <div className="field-block"><label>Repair Notes</label><textarea className="form-input form-textarea" value={form.repair_notes} onChange={(event) => updateForm('repair_notes', event.target.value)} /></div>
              <div className="field-block"><label>Resale Notes</label><textarea className="form-input form-textarea" value={form.resale_notes} onChange={(event) => updateForm('resale_notes', event.target.value)} /></div>
              <div className="field-block field-block-full"><label>General Notes</label><textarea className="form-input form-textarea form-textarea-tall" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></div>
            </div>

            <div className="panel-actions-row panel-actions-sticky">
              <button className="btn btn-primary" disabled={submitting} onClick={() => void handleCreateBuyback()}>
                {submitting ? 'Processing...' : 'Create Buyback'}
              </button>
              <button className="btn btn-secondary" onClick={resetForm}>Reset Form</button>
              <div className="inline-meta">
                <span>Store: {selectedStore?.name || 'None'}</span>
                <span>Technician: {selectedTechnician?.name || 'None'}</span>
              </div>
            </div>
          </section>
        </div>

        <aside className="buyback-sidebar card">
          <div className="sidebar-sticky">
            <div className="panel-header compact">
              <div>
                <span className="panel-kicker">Operations Drawer</span>
                <h2>Current Buyback</h2>
              </div>
              <span className="panel-caption">Sticky actions for the selected device.</span>
            </div>

            {selectedRow ? (
              <>
                <div className="selected-summary">
                  <div>
                    <strong>{selectedRow.imei}</strong>
                    <p>{getRowTitle(selectedRow)}</p>
                  </div>
                  <span className={badgeClassForWorkflow(selectedRow.status_key)}>{selectedRow.status}</span>
                </div>

                <div className="detail-stack">
                  <div className="detail-item"><span>Customer</span><strong>{selectedRow.customer_name || customerMap.get(selectedRow.customer || '')?.name || 'Walk-in'}</strong></div>
                  <div className="detail-item"><span>Store</span><strong>{selectedRow.assigned_store_name || selectedRow.store_name || storeMap.get(selectedRow.assigned_store_ref || selectedRow.store_ref || '')?.name || '-'}</strong></div>
                  <div className="detail-item"><span>Technician</span><strong>{selectedRow.assigned_technician_name || employeeMap.get(selectedRow.assigned_technician || '')?.name || '-'}</strong></div>
                  <div className="detail-item"><span>Age</span><strong>{selectedRow.days_in_inventory || 0} days</strong></div>
                  <div className="detail-item"><span>Profit</span><strong>Rs {Math.round(money(selectedRow.suggested_resale_price) - money(selectedRow.final_valuation)).toLocaleString()}</strong></div>
                </div>

                <div className="sidebar-actions">
                  {nextStatuses.map((status) => (
                    <button key={status} className="btn btn-secondary btn-block" disabled={submitting} onClick={() => void handleTransition(selectedRow, status)}>
                      {workflowLabels[status]}
                    </button>
                  ))}
                  <div className="transfer-box">
                    <label>Store transfer</label>
                    <select className="form-input" value={transferStoreId} onChange={(event) => setTransferStoreId(event.target.value)}>
                      <option value="">Select destination</option>
                      {stores.filter((store) => store.id !== (selectedRow.assigned_store_ref || selectedRow.store_ref)).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                    </select>
                    <button className="btn btn-warning btn-block" disabled={submitting} onClick={() => void handleTransfer(selectedRow)}>
                      Transfer Store
                    </button>
                  </div>
                  {isPrivilegedUser(user) && (
                    <button className="btn btn-danger btn-block" disabled={submitting} onClick={() => void handleDelete(selectedRow)}>
                      Archive Buyback
                    </button>
                  )}
                </div>

                <div className="history-strip">
                <h3>Buyback Timeline</h3>
                  <div className="history-list">
                    <article className="history-card">
                      <div>
                        <strong>Created</strong>
                        <p>{formatDate(selectedRow.created_at)}</p>
                      </div>
                    </article>
                    <article className="history-card">
                      <div>
                        <strong>Updated</strong>
                        <p>{formatDate(selectedRow.updated_at)}</p>
                      </div>
                    </article>
                    <article className="history-card">
                      <div>
                        <strong>Workflow</strong>
                        <p>{selectedRow.status}</p>
                      </div>
                    </article>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-slate">Select a row in the table to unlock workflow actions.</div>
            )}
          </div>
        </aside>
      </div>
      )}

      <section className="buyback-panel card buyback-table-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">Operations Table</span>
            <h2>Buyback Listing</h2>
          </div>
          <span className="panel-caption">Pagination, filters, exports, and row expansion are server-driven.</span>
        </div>

        <div className="toolbar-grid">
          <div className="field-block"><label>Search</label><input className="form-input" value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value, page: 1 }))} placeholder="IMEI, model, customer, store..." /></div>
          <div className="field-block"><label>Status</label><select className="form-input" value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as FilterState['status'], page: 1 }))}><option value="">All Statuses</option>{workflowOrder.map((status) => <option key={status} value={status}>{workflowLabels[status]}</option>)}</select></div>
          <div className="field-block"><label>Store</label><select className="form-input" value={filters.store_id} onChange={(event) => setFilters((prev) => ({ ...prev, store_id: event.target.value, page: 1 }))}><option value="">All stores</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div>
          <div className="field-block"><label>Technician</label><select className="form-input" value={filters.assigned_technician_id} onChange={(event) => setFilters((prev) => ({ ...prev, assigned_technician_id: event.target.value, page: 1 }))}><option value="">All technicians</option>{employees.filter((employee) => employee.role === 'Technician').map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></div>
          <div className="field-block"><label>From</label><input type="date" className="form-input" value={filters.from} onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value, page: 1 }))} /></div>
          <div className="field-block"><label>To</label><input type="date" className="form-input" value={filters.to} onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value, page: 1 }))} /></div>
          <div className="field-block"><label>Sort</label><select className="form-input" value={filters.sort_by} onChange={(event) => setFilters((prev) => ({ ...prev, sort_by: event.target.value as FilterState['sort_by'], page: 1 }))}><option value="created_at">Created</option><option value="updated_at">Updated</option><option value="imei">IMEI</option><option value="negotiated_price">Buyback Price</option><option value="market_value">Market Price</option><option value="final_valuation">Final Valuation</option><option value="status">Status</option></select></div>
          <div className="field-block"><label>Direction</label><select className="form-input" value={filters.sort_dir} onChange={(event) => setFilters((prev) => ({ ...prev, sort_dir: event.target.value as FilterState['sort_dir'], page: 1 }))}><option value="desc">Descending</option><option value="asc">Ascending</option></select></div>
        </div>

        <div className="table-actions-row">
          <button className="btn btn-secondary" onClick={exportPdf}>Export PDF</button>
          <div className="inline-meta">
            <span>Page {currentPageLabel}</span>
            <span>{pagination.total} records</span>
          </div>
        </div>

        <div className="table-shell">
          <table className="buyback-table">
            <thead>
              <tr>
                <th>Buyback ID</th>
                <th>IMEI</th>
                <th>Customer</th>
                <th>Device Model</th>
                <th>Condition</th>
                <th>Buyback Price</th>
                <th>Resale Price</th>
                <th>Profit Margin</th>
                <th>Repair Status</th>
                <th>Workflow Status</th>
                <th>Assigned Store</th>
                <th>Technician</th>
                <th>Buyback Date</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="skeleton-row">
                    {Array.from({ length: 15 }).map((__, cellIndex) => <td key={cellIndex}><div className="skeleton-bar" /></td>)}
                  </tr>
                ))
              ) : buybacks.length > 0 ? buybacks.map((item) => {
                const isExpanded = expandedRowId === item.id;
                const rowCustomer = item.customer_name || customerMap.get(item.customer || '')?.name || 'Walk-in';
                const rowStore = item.assigned_store_name || item.store_name || storeMap.get(item.assigned_store_ref || item.store_ref || '')?.name || '-';
                const rowTechnician = item.assigned_technician_name || employeeMap.get(item.assigned_technician || '')?.name || '-';
                return (
                  <Fragment key={item.id}>
                    <tr className={selectedRowId === item.id ? 'selected-row' : ''}>
                      <td className="monospace">{item.id.slice(-8).toUpperCase()}</td>
                      <td className="monospace">{item.imei}</td>
                      <td>{rowCustomer}</td>
                      <td>{getRowTitle(item)}</td>
                      <td><span className={badgeClassForCondition(item.condition)}>{item.condition}</span></td>
                      <td className="price-cell">Rs {moneyText(item.negotiated_price)}</td>
                      <td className="price-cell">Rs {moneyText(item.suggested_resale_price)}</td>
                      <td className="profit-cell">{Number(item.expected_profit_margin || 0).toFixed(2)}%</td>
                      <td><span className="repair-chip">{item.repair_notes ? 'Tracked' : 'Open'}</span></td>
                      <td><span className={badgeClassForWorkflow(item.status_key)}>{item.status}</span></td>
                      <td>{rowStore}</td>
                      <td>{rowTechnician}</td>
                      <td>{formatDate(item.created_at)}</td>
                      <td>{formatDate(item.updated_at || item.created_at)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedRowId(item.id); setExpandedRowId((prev) => (prev === item.id ? null : item.id)); }}>View</button>
                          {isPrivilegedUser(user) && (
                            <details className="quick-actions">
                              <summary className="btn btn-primary btn-sm">Actions</summary>
                              <div className="quick-actions-menu">
                                {workflowNextMap[item.status_key]?.map((status) => (
                                  <button key={status} onClick={() => void handleTransition(item, status)}>{workflowLabels[status]}</button>
                                ))}
                                <button onClick={() => { setSelectedRowId(item.id); setTransferStoreId(item.assigned_store_ref || item.store_ref || ''); }}>Select</button>
                                <button onClick={() => void handleDelete(item)} className="danger">Archive</button>
                              </div>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="expanded-row">
                        <td colSpan={15}>
                          <div className="expanded-grid">
                            <div>
                              <h4>Inspection</h4>
                              <p>Screen: {item.physical_inspection?.screen_condition || '-'}</p>
                              <p>Back: {item.physical_inspection?.back_panel_condition || '-'}</p>
                              <p>Frame: {item.physical_inspection?.frame_body_condition || '-'}</p>
                              <p>Camera: {item.physical_inspection?.camera_condition || '-'}</p>
                              <p>Buttons: {item.physical_inspection?.buttons_condition || '-'}</p>
                            </div>
                            <div>
                              <h4>Functional</h4>
                              <p>Display: {item.functional_inspection?.display_working ? 'Yes' : 'No'}</p>
                              <p>Touch: {item.functional_inspection?.touch_working ? 'Yes' : 'No'}</p>
                              <p>Face ID / Fingerprint: {item.functional_inspection?.face_id_fingerprint_working ? 'Yes' : 'No'}</p>
                              <p>Charging port: {item.functional_inspection?.charging_port_working ? 'Yes' : 'No'}</p>
                              <p>Speaker / Mic: {item.functional_inspection?.speaker_mic_working ? 'Yes' : 'No'}</p>
                            </div>
                            <div>
                              <h4>Pricing</h4>
                              <p>Market: Rs {moneyText(item.market_value)}</p>
                              <p>Final valuation: Rs {moneyText(item.final_valuation)}</p>
                              <p>Negotiated: Rs {moneyText(item.negotiated_price)}</p>
                              <p>Resale: Rs {moneyText(item.suggested_resale_price)}</p>
                              <p>Profit margin: {Number(item.expected_profit_margin || 0).toFixed(2)}%</p>
                            </div>
                            <div>
                              <h4>Audit Trail</h4>
                              <p>Created: {formatDate(item.created_at)}</p>
                              <p>Updated: {formatDate(item.updated_at || item.created_at)}</p>
                              <p>Age: {item.days_in_inventory || 0} days</p>
                              <p>Store transfer history: {item.transfer_history?.length || 0}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }) : (
                <tr>
                  <td colSpan={15} className="buyback-empty">No Buyback records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <button className="btn btn-secondary btn-sm" disabled={filters.page <= 1} onClick={() => refreshRows(Math.max(1, filters.page - 1))}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={filters.page >= pagination.totalPages} onClick={() => refreshRows(Math.min(pagination.totalPages, filters.page + 1))}>Next</button>
        </div>
      </section>
    </div>
  );
};

export default Buyback;
