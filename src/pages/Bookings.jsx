import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, Pencil, Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateCommissionAmount, defaultAgencySettings, fetchAgencySettings, getCommissionRuleForType, slugifyCommissionTypeKey } from '../lib/agencySettings';
import { ensureClientService } from '../lib/serviceWorkflow';
import CancelBookingModal from '../components/CancelBookingModal';
import SecureDeleteModal from '../components/ui/SecureDeleteModal';

const emptyBookingForm = {
  client_id: '',
  co_clients: [],
  passengers: [],
  package_id: '',
  package_ids: [],
  service_id: '',
  finish_date: '',
  status: 'pending',
  reference: '',
  note: '',
  cost_price: '',
  selling_price: '',
};

const createEmptyServiceLine = (serviceTypeId = '') => ({
  lineId: `new-${crypto.randomUUID()}`,
  dbId: null,
  service_type_id: serviceTypeId,
  supplier_id: '',
  cost_price: '',
  selling_price: '',
  tva_rate: 0,
  details: {},
});

const createEmptyPackageLine = (packageId = '', label = '') => ({
  lineId: `new-${crypto.randomUUID()}`,
  dbId: null,
  package_id: packageId,
  package_label: label,
  description: label,
  supplier_id: '',
  cost_price: '',
  selling_price: '',
  tva_rate: 0,
  details: {
    package_id: packageId || null,
    package_label: label || '',
  },
});

const fieldOptionsFromValue = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch (error) {
      // ignore invalid JSON; fall through to CSV parse
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizePackageIds = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item) => String(item));
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => String(item));
  }

  if (value == null) {
    return [];
  }

  return [String(value)];
};

const statusStyles = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-700',
  processing: 'bg-blue-100 text-blue-700',
};

const isBookingOverdue = (booking) => {
  if (!booking?.finish_date || booking.status === 'cancelled') return false;
  const finishDate = new Date(`${booking.finish_date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return finishDate < today;
};

const formatDzd = (value) =>
  new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const decrementPackageStock = async ({ supabase, packageId, seatsBooked = 1 }) => {
  if (!packageId || !supabase) return { error: null };

  const bookedSeats = Math.max(1, Number(seatsBooked || 1));

  const { error: rpcError } = await supabase.rpc('decrement_package_stock', {
    package_id: packageId,
    seats_booked: bookedSeats,
  });

  if (!rpcError) {
    return { error: null };
  }

  const { data: currentPkg, error: fetchError } = await supabase
    .from('package_templates')
    .select('stock')
    .eq('id', packageId)
    .single();

  if (fetchError) {
    return { error: fetchError };
  }

  const nextStock = Math.max(0, Number(currentPkg?.stock || 0) - bookedSeats);
  const { error: updateError } = await supabase
    .from('package_templates')
    .update({ stock: nextStock })
    .eq('id', packageId);

  return { error: updateError };
};

export default function Bookings({ language = 'en', onNotification }) {
  const t = {
    en: {
      eyebrow: 'Operations',
      title: 'Bookings',
      newBooking: 'New Booking',
      totalBookings: 'Total Bookings',
      confirmed: 'Confirmed',
      pending: 'Pending',
      totalRevenue: 'Total Revenue',
      search: 'Search',
      status: 'Status',
      fromDate: 'From date',
      toDate: 'To date',
      serviceType: 'Service Type',
      all: 'All',
      allServiceTypes: 'All service types',
      overdueOnly: 'Overdue only',
      overview: 'Booking overview',
      overviewSubtitle: 'Client, package, and service activity',
      loading: 'Loading bookings...',
      noBookings: 'No bookings found.',
      client: 'Client',
      clientRef: 'Client Ref',
      serviceTypes: 'Service Types',
      suppliers: 'Supplier(s)',
      costPrice: 'Cost Price',
      sellingPrice: 'Selling Price',
      profit: 'Profit',
      finishDate: 'Finish Date',
      actions: 'Actions',
      createBooking: 'Create booking',
      bookingDetails: 'Booking Details',
      createNew: 'Create New +',
      selectClient: 'Select Client',
      chooseClient: 'Choose client',
      coPayers: 'Co-Payers / Additional Clients',
      close: 'Close booking form',
      editBooking: 'Edit booking',
      cancelBooking: 'Cancel booking',
      deleteBooking: 'Delete booking',
      finishDateShort: 'Finish date',
      requiredField: 'is required for',
      clientOrRef: 'Client or booking ref',
      processing: 'Processing',
      cancelled: 'Cancelled',
      overdue: 'Overdue',
      setStatus: 'Status',
      unknownClient: 'Unknown Client',
      noServiceTypes: '—',
      notSet: '—',
    },
    ar: {
      eyebrow: 'العمليات',
      title: 'الحجوزات',
      newBooking: 'حجز جديد',
      totalBookings: 'إجمالي الحجوزات',
      confirmed: 'مؤكد',
      pending: 'قيد الانتظار',
      totalRevenue: 'إجمالي الإيرادات',
      search: 'بحث',
      status: 'الحالة',
      fromDate: 'من تاريخ',
      toDate: 'إلى تاريخ',
      serviceType: 'نوع الخدمة',
      all: 'الكل',
      allServiceTypes: 'كل أنواع الخدمات',
      overdueOnly: 'المتأخرة فقط',
      overview: 'نظرة عامة على الحجوزات',
      overviewSubtitle: 'نشاط العملاء والباقات والخدمات',
      loading: 'جارٍ تحميل الحجوزات...',
      noBookings: 'لا توجد حجوزات.',
      client: 'العميل',
      clientRef: 'مرجع العميل',
      serviceTypes: 'أنواع الخدمات',
      suppliers: 'الموردون',
      costPrice: 'سعر التكلفة',
      sellingPrice: 'سعر البيع',
      profit: 'الربح',
      finishDate: 'تاريخ الانتهاء',
      actions: 'الإجراءات',
      createBooking: 'إنشاء حجز',
      bookingDetails: 'تفاصيل الحجز',
      createNew: 'إنشاء جديد +',
      selectClient: 'اختر العميل',
      chooseClient: 'اختر العميل',
      coPayers: 'المشاركون / العملاء الإضافيون',
      close: 'إغلاق نموذج الحجز',
      editBooking: 'تعديل الحجز',
      cancelBooking: 'إلغاء الحجز',
      deleteBooking: 'حذف الحجز',
      finishDateShort: 'تاريخ الانتهاء',
      requiredField: 'مطلوب لـ',
      clientOrRef: 'اسم العميل أو مرجع الحجز',
      processing: 'قيد المعالجة',
      cancelled: 'ملغى',
      overdue: 'متأخر',
      setStatus: 'الحالة',
      unknownClient: 'عميل غير معروف',
      noServiceTypes: '—',
      notSet: '—',
    },
  }[language] || {
    eyebrow: 'Operations',
    title: 'Bookings',
    newBooking: 'New Booking',
    totalBookings: 'Total Bookings',
    confirmed: 'Confirmed',
    pending: 'Pending',
    totalRevenue: 'Total Revenue',
    search: 'Search',
    status: 'Status',
    fromDate: 'From date',
    toDate: 'To date',
    serviceType: 'Service Type',
    all: 'All',
    allServiceTypes: 'All service types',
    overdueOnly: 'Overdue only',
    overview: 'Booking overview',
    overviewSubtitle: 'Client, package, and service activity',
    loading: 'Loading bookings...',
    noBookings: 'No bookings found.',
    client: 'Client',
    clientRef: 'Client Ref',
    serviceTypes: 'Service Types',
    suppliers: 'Supplier(s)',
    costPrice: 'Cost Price',
    sellingPrice: 'Selling Price',
    profit: 'Profit',
    finishDate: 'Finish Date',
    actions: 'Actions',
    createBooking: 'Create booking',
    bookingDetails: 'Booking Details',
    createNew: 'Create New +',
    selectClient: 'Select Client',
    chooseClient: 'Choose client',
    coPayers: 'Co-Payers / Additional Clients',
    close: 'Close booking form',
    editBooking: 'Edit booking',
    cancelBooking: 'Cancel booking',
    deleteBooking: 'Delete booking',
    finishDateShort: 'Finish date',
    requiredField: 'is required for',
    clientOrRef: 'Client or booking ref',
    processing: 'Processing',
    cancelled: 'Cancelled',
    overdue: 'Overdue',
    setStatus: 'Status',
    unknownClient: 'Unknown Client',
    noServiceTypes: '—',
    notSet: '—',
  };

  const [bookings, setBookings] = useState([]);
  const [clients, setClients] = useState([]);
  const [packages, setPackages] = useState([]);
  const [packageTemplates, setPackageTemplates] = useState([]);
  const [serviceTemplates, setServiceTemplates] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [form, setForm] = useState(emptyBookingForm);
  const [serviceTypeLines, setServiceTypeLines] = useState([]);
  const [packageLines, setPackageLines] = useState([]);
  const [serviceTypeFieldCache, setServiceTypeFieldCache] = useState({});
  const [serviceTypeSearch, setServiceTypeSearch] = useState('');
  const [isServiceTypePickerOpen, setIsServiceTypePickerOpen] = useState(false);
  const [packageSearch, setPackageSearch] = useState('');
  const [isPackagePickerOpen, setIsPackagePickerOpen] = useState(false);
  const [agencySettings, setAgencySettings] = useState(defaultAgencySettings);
  const [selectedCoClients, setSelectedCoClients] = useState([]);
  const [selectedTravelers, setSelectedTravelers] = useState([]);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [cancelBookingTarget, setCancelBookingTarget] = useState(null);
  const [deleteBookingTarget, setDeleteBookingTarget] = useState(null);
  const [quickCreateType, setQuickCreateType] = useState(null);
  const [quickCreateCustomType, setQuickCreateCustomType] = useState('');
  const [quickCreateForm, setQuickCreateForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    name: '',
    type: 'General',
    price: '',
    supplier_id: '',
  });
  const navigate = useNavigate();

  const supplierTypeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          'General',
          'Hotel',
          'Airline',
          'Transport',
          'Tour Operator',
          'Visa',
          'Insurance',
          'Agency',
          'Other',
        ])
      ).filter(Boolean),
    []
  );

  const notify = (title, message, type = 'info', route = null) => {
    if (onNotification) {
      onNotification({ title, message, type, route });
    }
  };

  const fetchBookings = async () => {
    try {
      if (!supabase) {
        setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        setBookings([]);
        return;
      }

      const { data, error: bookingsError } = await supabase
        .from('bookings')
        .select(
          '*, clients(full_name, reference), booking_service_lines(supplier_id, service_type_id, suppliers(name), service_types(name))'
        )
        .order('id', { ascending: false });

      if (bookingsError) throw bookingsError;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiredBookings = (data || []).filter(
        (booking) =>
          booking.finish_date &&
          booking.status !== 'cancelled' &&
          booking.status !== 'overdue' &&
          new Date(`${booking.finish_date}T00:00:00`) < today
      );

      if (expiredBookings.length > 0 && supabase) {
        await Promise.all(
          expiredBookings.map((booking) =>
            supabase.from('bookings').update({ status: 'overdue' }).eq('id', booking.id)
          )
        );
      }

      const normalizedBookings = (data || []).map((booking) =>
        expiredBookings.some((item) => item.id === booking.id) ? { ...booking, status: 'overdue' } : booking
      );

      setBookings(normalizedBookings);
    } catch (err) {
      setError(err.message || 'Unable to load bookings.');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase) {
          setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
          setClients([]);
          setPackages([]);
          setServiceTemplates([]);
          setSuppliers([]);
          setServiceTypes([]);
          setBookings([]);
          return;
        }

        const [clientsRes, packagesRes, packageTemplatesRes, servicesRes, suppliersRes, serviceTypesRes, bookingsRes, agencySettingsRes] = await Promise.all([
          supabase.from('clients').select('id, full_name, phone, email, companions').order('full_name', { ascending: true }),
          supabase.from('packages').select('id, title, destination, price, cost_price, pricing_mode, supplier_id').order('title', { ascending: true }),
          supabase
            .from('package_templates')
            .select('id, label, destination, template_type, type, country, service_ref')
            .order('label', { ascending: true }),
          supabase.from('service_templates').select('id, title, client_id, supplier_id, package_id').order('title', { ascending: true }),
          supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
          supabase
            .from('service_types')
            .select('id, name, service_type_suppliers(supplier_id)')
            .order('name', { ascending: true }),
          supabase
            .from('bookings')
            .select(
              '*, clients(full_name, reference), booking_service_lines(supplier_id, service_type_id, suppliers(name), service_types(name))'
            )
            .order('id', { ascending: false }),
          fetchAgencySettings(),
        ]);

        if (clientsRes.error) throw clientsRes.error;
        if (packagesRes.error) throw packagesRes.error;
        if (servicesRes.error) throw servicesRes.error;
        if (suppliersRes.error) throw suppliersRes.error;
        if (serviceTypesRes.error) throw serviceTypesRes.error;
        if (bookingsRes.error) throw bookingsRes.error;

        setClients(clientsRes.data || []);
        setPackages(packagesRes.data || []);
        setPackageTemplates(packageTemplatesRes.data || []);
        setServiceTemplates(servicesRes.data || []);
        setSuppliers(suppliersRes.data || []);
        setServiceTypes(
          (serviceTypesRes.data || []).map((type) => ({
            ...type,
            supplierIds: (type.service_type_suppliers || []).map((link) => link.supplier_id).filter(Boolean),
          }))
        );
        setBookings(bookingsRes.data || []);
        setAgencySettings(agencySettingsRes || defaultAgencySettings);
      } catch (err) {
        setError(err.message || 'Unable to load bookings data.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const bookingStats = useMemo(() => {
    const totalBookings = bookings.length;
    const confirmed = bookings.filter((booking) => booking.status === 'confirmed').length;
    const pending = bookings.filter((booking) => booking.status === 'pending').length;
    const totalRevenue = bookings.reduce((sum, booking) => sum + Number(booking.selling_price || 0), 0);

    return {
      totalBookings,
      confirmed,
      pending,
      totalRevenue,
    };
  }, [bookings]);

  const rows = useMemo(() => {
    const query = (searchQuery || '').trim().toLowerCase();

    return bookings
      .filter((booking) => (showOverdueOnly ? isBookingOverdue(booking) : true))
      .filter((booking) => {
        if (statusFilter !== 'all' && booking.status !== statusFilter) return false;

        if (serviceTypeFilter !== 'all') {
          const matchesServiceType = (booking.booking_service_lines || []).some(
            (line) => line.service_types?.name === serviceTypeFilter
          );
          if (!matchesServiceType) return false;
        }

        if (startDate && booking.created_at && new Date(booking.created_at) < new Date(`${startDate}T00:00:00`)) {
          return false;
        }

        if (endDate && booking.created_at && new Date(booking.created_at) > new Date(`${endDate}T23:59:59`)) {
          return false;
        }

        if (!query) return true;

        const clientName = (booking.clients?.full_name || '').toLowerCase();
        const bookingRef = (booking.reference || '').toLowerCase();
        return clientName.includes(query) || bookingRef.includes(query);
      })
      .map((booking) => {
        const serviceTypeNames = [...new Set((booking.booking_service_lines || []).map((line) => line.service_types?.name).filter(Boolean))];
        const supplierNames = [...new Set((booking.booking_service_lines || []).map((line) => line.suppliers?.name).filter(Boolean))];
        const bookingCost = Number(booking.cost_price ?? (booking.booking_service_lines || []).reduce((sum, line) => sum + Number(line.cost_price || 0), 0));
        const bookingSelling = Number(booking.selling_price ?? (booking.booking_service_lines || []).reduce((sum, line) => sum + Number(line.selling_price || 0), 0));

        return {
          ...booking,
          clientName: booking.clients?.full_name || 'Unknown Client',
          clientRef: booking.clients?.reference || '—',
          packageName: booking.packages?.title || '—',
          serviceName: booking.service_templates?.title || '—',
          supplierName: booking.suppliers?.name || supplierNames.join(', ') || '—',
          serviceTypeNames,
          supplierNames,
          costPrice: bookingCost,
          sellingPrice: bookingSelling,
          profit: bookingSelling - bookingCost,
          dueLabel: booking.finish_date
            ? new Date(`${booking.finish_date}T00:00:00`).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : '—',
          isLate: isBookingOverdue(booking),
        };
      });
  }, [bookings, showOverdueOnly, searchQuery, statusFilter, startDate, endDate, serviceTypeFilter]);

  const bookingTotals = useMemo(() => {
    const allLines = [...serviceTypeLines, ...packageLines];
    const costPrice = allLines.reduce((sum, line) => sum + (Number(line.cost_price) || 0), 0);
    const sellingPrice = allLines.reduce((sum, line) => sum + (Number(line.selling_price) || 0), 0);

    return {
      costPrice,
      sellingPrice,
      profit: sellingPrice - costPrice,
    };
  }, [serviceTypeLines, packageLines]);

  const packageLinesEnabled = agencySettings.enable_package_lines !== false;

  const selectedCoClientIds = selectedCoClients;

  const availableTravelers = useMemo(() => {
    const travelers = [];

    const getCompanions = (client) => {
      if (!client || !client.companions) return [];
      let parsed = client.companions;
      try {
        while (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error('Failed to parse companions:', e);
        return [];
      }
    };

    const leadClient = clients.find((client) => client.id === form.client_id);
    if (leadClient) {
      travelers.push({ id: leadClient.id, name: leadClient.full_name, type: 'Lead Client' });
      getCompanions(leadClient).forEach((comp, idx) => {
        if (comp.full_name) {
          travelers.push({
            id: `comp-lead-${idx}`,
            name: comp.full_name,
            type: `Companion of ${leadClient.full_name}`,
          });
        }
      });
    }

    selectedCoClientIds.forEach((coId) => {
      const coClient = clients.find((client) => client.id === coId);
      if (coClient) {
        travelers.push({ id: coClient.id, name: coClient.full_name, type: 'Co-Payer' });
        getCompanions(coClient).forEach((comp, idx) => {
          if (comp.full_name) {
            travelers.push({
              id: `comp-co-${coId}-${idx}`,
              name: comp.full_name,
              type: `Companion of ${coClient.full_name}`,
            });
          }
        });
      }
    });

    return travelers;
  }, [clients, form.client_id, selectedCoClientIds]);

  const selectedPassengers = useMemo(
    () => availableTravelers.filter((traveler) => selectedTravelers.includes(traveler.id)),
    [availableTravelers, selectedTravelers]
  );

  const handlePassengerToggle = (traveler, checked) => {
    setSelectedTravelers((prev) => {
      if (checked) {
        return prev.includes(traveler.id) ? prev : [...prev, traveler.id];
      }
      return prev.filter((id) => id !== traveler.id);
    });
  };

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      co_clients: selectedCoClients,
      passengers: availableTravelers
        .filter((traveler) => selectedTravelers.includes(traveler.id))
        .map((traveler) => ({
          id: traveler.id,
          client_id: traveler.type === 'Lead Client' || traveler.type === 'Co-Payer' ? traveler.id : null,
          full_name: traveler.name,
          type: traveler.type,
        })),
    }));
  }, [selectedCoClients, selectedTravelers, availableTravelers]);

  const openCreateModal = () => {
    setSelectedBooking(null);
    setForm({ ...emptyBookingForm, co_clients: [], passengers: [] });
    setSelectedCoClients([]);
    setSelectedTravelers([]);
    setServiceTypeLines([]);
    setPackageLines([]);
    setServiceTypeSearch('');
    setPackageSearch('');
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = async (booking) => {
    const bookingPackageIds = normalizePackageIds(booking.package_ids || booking.package_id || '');

    const initialCoClients = Array.isArray(booking.co_clients) ? booking.co_clients.filter(Boolean) : [];
    const initialTravelers = Array.isArray(booking.passengers)
      ? booking.passengers
          .map((traveler) => {
            if (traveler?.id) return traveler.id;
            if (traveler?.client_id === booking.client_id) return booking.client_id;
            if (traveler?.client_id) return traveler.client_id;
            return null;
          })
          .filter(Boolean)
      : [];

    setSelectedBooking(booking);
    setForm({
      client_id: booking.client_id || '',
      co_clients: initialCoClients,
      passengers: Array.isArray(booking.passengers) ? booking.passengers : [],
      package_id: bookingPackageIds[0] || booking.package_id || '',
      package_ids: bookingPackageIds,
      service_id: booking.service_id || '',
      finish_date: booking.finish_date || '',
      status: booking.status || 'pending',
      reference: booking.reference || '',
      note: booking.note || '',
      cost_price: booking.cost_price ?? '',
      selling_price: booking.selling_price ?? '',
    });
    setSelectedCoClients(initialCoClients);
    setSelectedTravelers(initialTravelers);
    setServiceTypeSearch('');
    setPackageSearch('');
    setError('');
    setIsModalOpen(true);

    if (!supabase) return;

    try {
      let linesQuery = supabase
        .from('booking_service_lines')
        .select('id, service_type_id, supplier_id, cost_price, selling_price, tva_rate, description, details')
        .eq('booking_id', booking.id);

      let { data, error: linesError } = await linesQuery;

      if (linesError && /selling_price|cost_price|booking_service_lines|column .* does not exist/i.test(linesError.message || '')) {
        const fallbackResult = await supabase
          .from('booking_service_lines')
          .select('id, service_type_id, supplier_id, cost_price, selling_price, tva_rate, description, details')
          .eq('booking_id', booking.id);

        if (fallbackResult.error) throw fallbackResult.error;
        data = fallbackResult.data || [];
      } else if (linesError) {
        throw linesError;
      }

      const serviceLines = (data || [])
      .filter((line) => line.service_type_id)
      .map((line) => ({
        lineId: line.id,
        dbId: line.id,
        service_type_id: line.service_type_id || '',
        supplier_id: line.supplier_id || '',
        cost_price: line.cost_price ?? '',
        selling_price: line.selling_price ?? '',
        tva_rate: Number(line.tva_rate || 0),
        details: line.details || {},
      }));

      const packageServiceLines = (data || [])
        .filter((line) => !line.service_type_id && (line.description || line.details?.package_id))
        .map((line) => ({
          lineId: line.id,
          dbId: line.id,
          package_id: line.details?.package_id || null,
          package_label: line.description || line.details?.package_label || 'Package',
          description: line.description || line.details?.package_label || 'Package',
          supplier_id: line.supplier_id || '',
          cost_price: line.cost_price ?? '',
          selling_price: line.selling_price ?? '',
          tva_rate: Number(line.tva_rate || 0),
          details: {
            ...(line.details || {}),
            package_id: line.details?.package_id || null,
            package_label: line.description || line.details?.package_label || 'Package',
          },
        }));

      setServiceTypeLines(serviceLines);
      setPackageLines(packageServiceLines);
    } catch (err) {
      console.warn('Unable to load booking service lines:', err?.message || err);
      setServiceTypeLines([]);
    }
  };

  const togglePackageSelection = (packageId) => {
    setForm((prev) => {
      const nextPackageIds = prev.package_ids.includes(packageId)
        ? prev.package_ids.filter((id) => id !== packageId)
        : [...prev.package_ids, packageId];

      return {
        ...prev,
        package_ids: nextPackageIds,
        package_id: nextPackageIds[0] || '',
      };
    });
  };

  const addServiceTypeLine = (serviceTypeId) => {
    if (!serviceTypeId) return;
    setServiceTypeLines((prev) => [...prev, createEmptyServiceLine(serviceTypeId)]);
    setServiceTypeSearch('');
    setIsServiceTypePickerOpen(false);
  };

  const addPackageLine = (packageId) => {
    if (!packageId) return;
    const selectedPackage = packageTemplates.find((template) => template.id === packageId);
    setPackageLines((prev) => [
      ...prev,
      createEmptyPackageLine(packageId, selectedPackage?.label || selectedPackage?.service_ref || 'Package'),
    ]);
    setPackageSearch('');
    setIsPackagePickerOpen(false);
  };

  const updateServiceTypeLine = (lineId, field, value) => {
    setServiceTypeLines((prev) =>
      prev.map((line) => (line.lineId === lineId ? { ...line, [field]: value } : line))
    );
  };

  const removeServiceTypeLine = (lineId) => {
    setServiceTypeLines((prev) => prev.filter((line) => line.lineId !== lineId));
  };

  const updatePackageLine = (lineId, field, value) => {
    setPackageLines((prev) =>
      prev.map((line) => {
        if (line.lineId !== lineId) return line;

        const nextLine = { ...line, [field]: value };

        if (field === 'package_id') {
          const selectedPackage = packageTemplates.find((template) => template.id === value);
          const packageLabel = selectedPackage?.label || selectedPackage?.service_ref || 'Package';
          nextLine.package_label = packageLabel;
          nextLine.description = packageLabel;
          nextLine.details = {
            package_id: value || null,
            package_label: packageLabel,
          };
        }

        if (field === 'supplier_id' || field === 'cost_price' || field === 'selling_price') {
          nextLine.details = {
            ...(nextLine.details || {}),
            package_id: nextLine.package_id || null,
            package_label: nextLine.package_label || nextLine.description || 'Package',
          };
        }

        return nextLine;
      })
    );
  };

  const removePackageLine = (lineId) => {
    setPackageLines((prev) => prev.filter((line) => line.lineId !== lineId));
  };

  const loadServiceTypeFields = async (serviceTypeId) => {
    if (!serviceTypeId || !supabase) return;

    const baseQuery = supabase
      .from('service_type_fields')
      .select('id, service_type_id, name, field_key, field_type, required, options, sort_order')
      .eq('service_type_id', serviceTypeId);

    let result = await baseQuery.order('sort_order', { ascending: true });

    if (
      result.error &&
      /sort_order|service_type_fields|does not exist|column .* does not exist/i.test(result.error.message || '')
    ) {
      result = await baseQuery;
    }

    if (!result.error) {
      setServiceTypeFieldCache((prev) => ({
        ...prev,
        [serviceTypeId]: result.data || [],
      }));
    }
  };

  useEffect(() => {
    serviceTypeLines.forEach((line) => {
      if (line.service_type_id && !serviceTypeFieldCache[line.service_type_id]) {
        loadServiceTypeFields(line.service_type_id);
      }
    });
  }, [serviceTypeLines, serviceTypeFieldCache]);

  const getSuppliersForServiceType = (serviceTypeId) => {
    const type = serviceTypes.find((item) => item.id === serviceTypeId);
    if (!type || !type.supplierIds?.length) return suppliers;
    return suppliers.filter((supplier) => type.supplierIds.includes(supplier.id));
  };

  const updateLineDetails = (lineId, fieldKey, value) => {
    setServiceTypeLines((prev) =>
      prev.map((line) =>
        line.lineId === lineId
          ? {
              ...line,
              details: {
                ...(line.details || {}),
                [fieldKey]: value,
              },
            }
          : line
      )
    );
  };

  const renderDynamicFieldInput = (line, field) => {
    const value = line.details?.[field.field_key] ?? '';
    const options = fieldOptionsFromValue(field.options);

    if (field.field_type === 'date') {
      return (
        <input
          type="date"
          value={value}
          onChange={(event) => updateLineDetails(line.lineId, field.field_key, event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
        />
      );
    }

    if (field.field_type === 'number') {
      return (
        <input
          type="number"
          value={value}
          onChange={(event) => updateLineDetails(line.lineId, field.field_key, event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
        />
      );
    }

    if (field.field_type === 'select') {
      return (
        <select
          value={value}
          onChange={(event) => updateLineDetails(line.lineId, field.field_key, event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
        >
          <option value="">Select</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    if (field.field_type === 'textarea') {
      return (
        <textarea
          rows={3}
          value={value}
          onChange={(event) => updateLineDetails(line.lineId, field.field_key, event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
        />
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(event) => updateLineDetails(line.lineId, field.field_key, event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
      />
    );
  };

  const handleFieldChange = (field, value) => {
    if (field === 'client_id') {
      const leadId = value ? `lead-${value}` : null;
      setSelectedTravelers((prev) => {
        const next = prev.filter((travelerId) => travelerId !== null && !travelerId.startsWith('lead-'));
        return leadId ? [...next, leadId] : next;
      });
      setForm((prev) => ({
        ...prev,
        client_id: value,
        co_clients: prev.co_clients || [],
        passengers: value
          ? [{ id: `lead-${value}`, client_id: value, full_name: clients.find((client) => client.id === value)?.full_name || 'Lead Client', type: 'lead' }]
          : [],
      }));
      return;
    }

    if (field === 'package_id') {
      setForm((prev) => ({
        ...prev,
        package_id: value,
        package_ids: value ? [value] : [],
      }));
      return;
    }

    if (field === 'service_id') {
      const selectedService = serviceTemplates.find((service) => service.id === value) || null;
      const servicePackageId = selectedService?.package_id || null;

      setForm((prev) => ({
        ...prev,
        service_id: value,
        package_id: prev.package_id || servicePackageId || '',
      }));
      return;
    }

    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const createServiceTemplateForBooking = async () => {
    if (!supabase) {
      setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    if (!form.client_id) {
      setError('Please select a client before creating a booking service.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const selectedPackage = packages.find((packageItem) => packageItem.id === form.package_id) || null;
      const nextSupplierId = serviceTypeLines.find((line) => line.supplier_id)?.supplier_id || selectedPackage?.supplier_id || null;
      const uniqueCountryId = `client-${form.client_id.slice(0, 8)}-${Date.now().toString(36)}`;

      const { data, error: insertError } = await supabase
        .from('service_templates')
        .insert([
          {
            title: `Service for ${clients.find((client) => client.id === form.client_id)?.full_name || 'Client'}`,
            country_id: uniqueCountryId,
            visa_type_id: 'client-service',
            client_id: form.client_id,
            supplier_id: nextSupplierId,
            package_id: form.package_id || null,
          },
        ])
        .select('id, title, client_id, supplier_id, package_id')
        .single();

      if (insertError) throw insertError;

      setServiceTemplates((prev) => [...prev, data].sort((a, b) => (a.title || '').localeCompare(b.title || '')));
      setForm((prev) => ({ ...prev, service_id: data.id }));
    } catch (err) {
      setError(err.message || 'Unable to create a booking-bound service.');
    } finally {
      setSaving(false);
    }
  };

  const syncClientServiceAssignment = async (serviceId, clientId) => {
    if (!serviceId || !clientId || !supabase) return;

    try {
      await ensureClientService({ clientId, templateId: serviceId });
    } catch (err) {
      console.warn('Unable to assign client service from template:', err?.message || err);
    }
  };

  const syncBookingTask = async ({ clientId, supplierId, serviceId, packageId, serviceTitle, status }) => {
    if (!serviceId || !clientId) return;

    const normalizedStatus = status === 'confirmed' ? 'in_progress' : status === 'cancelled' ? 'done' : 'todo';

    const { data: existingTask, error: fetchError } = await supabase
      .from('tasks')
      .select('id')
      .eq('service_id', serviceId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const basePayload = {
      title: serviceTitle || 'Linked service task',
      client_id: clientId,
      supplier_id: supplierId || null,
      package_id: packageId || null,
      service_id: serviceId,
      status: normalizedStatus,
      priority: 'Medium',
    };

    if (existingTask?.id) {
      const { error: updateError } = await supabase.from('tasks').update(basePayload).eq('id', existingTask.id);
      if (updateError) throw updateError;
      return;
    }

    const { error: insertError } = await supabase.from('tasks').insert([basePayload]);
    if (insertError) throw insertError;
  };

  // Supplier debt is maintained by a Supabase trigger on booking_service_lines; the form only manages the line rows.
  const syncBookingServiceLines = async (bookingId, lines) => {
    if (!bookingId || !supabase) return;

    const { data: existingRows, error: fetchError } = await supabase
      .from('booking_service_lines')
      .select('id')
      .eq('booking_id', bookingId);

    if (fetchError) throw fetchError;

    const existingIds = new Set((existingRows || []).map((row) => row.id));
    const keptIds = new Set(lines.filter((line) => line.dbId).map((line) => line.dbId));
    const removedIds = [...existingIds].filter((id) => !keptIds.has(id));

    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase.from('booking_service_lines').delete().in('id', removedIds);
      if (deleteError) throw deleteError;
    }

    const baseInsertPayload = (line) => {
      const packageDetails =
        line.package_id || line.package_label
          ? {
              package_id: line.package_id || null,
              package_label: line.package_label || line.description || '',
            }
          : {};

      return {
        booking_id: bookingId,
        description: line.description || line.package_label || '',
        service_type_id: line.service_type_id || null,
        supplier_id: line.supplier_id || null,
        tva_rate: Number(line.tva_rate || 0),
        details: {
          ...(line.details || {}),
          ...packageDetails,
        },
        ...(line.cost_price !== '' && line.cost_price !== null && line.cost_price !== undefined ? { cost_price: Number(line.cost_price) || 0 } : {}),
        ...(line.selling_price !== '' && line.selling_price !== null && line.selling_price !== undefined ? { selling_price: Number(line.selling_price) || 0 } : {}),
      };
    };

    const toInsert = lines.filter((line) => !line.dbId).map(baseInsertPayload);

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from('booking_service_lines').insert(toInsert);
      if (insertError && /selling_price|cost_price|column .* does not exist/i.test(insertError.message || '')) {
        const fallbackRows = toInsert.map(({ selling_price, cost_price, ...rest }) => rest);
        const fallbackResult = await supabase.from('booking_service_lines').insert(fallbackRows);
        if (fallbackResult.error) throw fallbackResult.error;
      } else if (insertError) {
        throw insertError;
      }
    }

    const toUpdate = lines.filter((line) => line.dbId);
    for (const line of toUpdate) {
      const packageDetails =
        line.package_id || line.package_label
          ? {
              package_id: line.package_id || null,
              package_label: line.package_label || line.description || '',
            }
          : {};

      const baseUpdatePayload = {
        description: line.description || line.package_label || '',
        service_type_id: line.service_type_id || null,
        supplier_id: line.supplier_id || null,
        tva_rate: Number(line.tva_rate || 0),
        details: {
          ...(line.details || {}),
          ...packageDetails,
        },
        ...(line.cost_price !== '' && line.cost_price !== null && line.cost_price !== undefined ? { cost_price: Number(line.cost_price) || 0 } : {}),
        ...(line.selling_price !== '' && line.selling_price !== null && line.selling_price !== undefined ? { selling_price: Number(line.selling_price) || 0 } : {}),
      };

      const { error: updateError } = await supabase
        .from('booking_service_lines')
        .update(baseUpdatePayload)
        .eq('id', line.dbId);

      if (updateError && /selling_price|cost_price|column .* does not exist/i.test(updateError.message || '')) {
        const fallbackPayload = Object.fromEntries(
          Object.entries(baseUpdatePayload).filter(([key]) => key !== 'selling_price' && key !== 'cost_price')
        );
        const fallbackResult = await supabase
          .from('booking_service_lines')
          .update(fallbackPayload)
          .eq('id', line.dbId);
        if (fallbackResult.error) throw fallbackResult.error;
      } else if (updateError) {
        throw updateError;
      }
    }
  };

  const createCommissionEntriesForBooking = async (bookingRecord) => {
    if (!supabase || !bookingRecord?.id || !bookingRecord?.agent_id) return;

    try {
      const settings = await fetchAgencySettings();
      const { data: serviceLines, error: linesError } = await supabase
        .from('booking_service_lines')
        .select('id, booking_id, service_type_id, selling_price, cost_price, service_types(name)')
        .eq('booking_id', bookingRecord.id);

      if (linesError) throw linesError;

      const rowsToInsert = (serviceLines || []).map((line) => {
        const serviceTypeName = String(line?.service_types?.name || 'custom_service').trim();
        const typeKey = slugifyCommissionTypeKey(serviceTypeName);
        const rule = getCommissionRuleForType(typeKey, settings);
        const profit = Math.max(Number(line?.selling_price || 0) - Number(line?.cost_price || 0), 0);
        const amount = rule.enabled ? calculateCommissionAmount(typeKey, profit, settings) : 0;
        return {
          agent_id: bookingRecord.agent_id,
          booking_id: bookingRecord.id,
          invoice_id: null,
          amount: Number(amount || 0),
          status: 'PENDING_PAYMENT',
          notes: `${serviceTypeName} commission pending payment`,
        };
      }).filter((row) => Number(row.amount || 0) > 0);

      if (rowsToInsert.length === 0) return;

      const { data: existingRows, error: existingError } = await supabase
        .from('agent_commissions')
        .select('id, booking_id, agent_id, invoice_id')
        .eq('booking_id', bookingRecord.id);

      if (existingError) throw existingError;

      const existingKeys = new Set((existingRows || []).map((row) => `${row.booking_id}|${row.agent_id}|${row.invoice_id || 'none'}`));
      const newRows = rowsToInsert.filter((row) => !existingKeys.has(`${row.booking_id}|${row.agent_id}|${row.invoice_id || 'none'}`));

      if (newRows.length > 0) {
        const { error: insertError } = await supabase.from('agent_commissions').insert(newRows);
        if (insertError) {
          console.warn('Unable to create commission rows for booking:', insertError.message || insertError);
        }
      }
    } catch (err) {
      console.warn('Booking commission creation failed:', err?.message || err);
    }
  };

  const createInvoiceForBooking = async (bookingRecord) => {
    if (!bookingRecord?.id || !bookingRecord?.client_id || !supabase) return;

    const [bookingLinesRes, packageLinksRes] = await Promise.all([
      supabase
        .from('booking_service_lines')
        .select('selling_price, tva_rate')
        .eq('booking_id', bookingRecord.id),
      supabase
        .from('booking_packages')
        .select('package_id, packages(id, title, selling_price, price)')
        .eq('booking_id', bookingRecord.id)
    ]);

    if (bookingLinesRes.error) throw bookingLinesRes.error;
    if (packageLinksRes.error) throw packageLinksRes.error;

    const bookingLineSubtotal = (bookingLinesRes.data || []).reduce((sum, line) => sum + Number(line.selling_price || 0), 0);
    const packageSubtotal = (packageLinksRes.data || []).reduce((sum, item) => {
      const packageSelling = Number(item.packages?.selling_price ?? item.packages?.price ?? 0);
      return sum + packageSelling;
    }, 0);
    const fallbackSubtotal = Number(bookingRecord.selling_price || 0);
    const subtotal = Math.max(bookingLineSubtotal + packageSubtotal, fallbackSubtotal, 0);
    const tvaAmount = (bookingLinesRes.data || []).reduce(
      (sum, line) => sum + Number(line.selling_price || 0) * (Number(line.tva_rate || 0) / 100),
      0
    ) + (packageLinksRes.data || []).reduce((sum, item) => {
      const packageSelling = Number(item.packages?.selling_price ?? item.packages?.price ?? 0);
      return sum + packageSelling * 0.19;
    }, 0);
    const grandTotal = Number((subtotal + tvaAmount).toFixed(2));

    if (!subtotal || subtotal <= 0) return;

    const { data: existingInvoice, error: fetchInvoiceError } = await supabase
      .from('invoices')
      .select('id, subtotal, tva_amount, grand_total, booking_id, status, client_id')
      .eq('booking_id', bookingRecord.id)
      .maybeSingle();

    if (fetchInvoiceError) throw fetchInvoiceError;

    const payload = {
      booking_id: bookingRecord.id,
      client_id: bookingRecord.client_id,
      subtotal: Number(subtotal.toFixed(2)),
      apply_tva: false,
      tva_amount: Number(tvaAmount.toFixed(2)),
      grand_total: grandTotal,
      status: 'pending',
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      reference: bookingRecord.reference || null,
      note: bookingRecord.note || null,
      account_id: bookingRecord.account_id || null,
    };

    const invoiceChanged = !existingInvoice || Number(existingInvoice.subtotal || 0) !== payload.subtotal || Number(existingInvoice.tva_amount || 0) !== payload.tva_amount || Number(existingInvoice.grand_total || 0) !== payload.grand_total;

    if (existingInvoice?.id && !invoiceChanged) {
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const invoicePayload = {
      ...payload,
      agent_id: userData?.user?.id || null,
    };

    if (existingInvoice?.id) {
      const { error: updateInvoiceError } = await supabase.from('invoices').update(invoicePayload).eq('id', existingInvoice.id);
      if (updateInvoiceError) throw updateInvoiceError;

      await createCommissionEntriesForBooking({ ...bookingRecord, ...payload, agent_id: bookingRecord.agent_id });
      await supabase.from('bookings').update({ status: 'processing' }).eq('id', bookingRecord.id);
      return;
    }

    const { error: insertInvoiceError } = await supabase.from('invoices').insert([invoicePayload]);
    if (insertInvoiceError) throw insertInvoiceError;

    await createCommissionEntriesForBooking({ ...bookingRecord, ...payload, agent_id: bookingRecord.agent_id });
    await supabase.from('bookings').update({ status: 'processing' }).eq('id', bookingRecord.id);
  };

  const syncBookingPackageLinks = async (bookingId, packageIds) => {
    if (!bookingId || !supabase || !packageIds.length) return;

    try {
      const rows = packageIds.map((packageId) => ({
        booking_id: bookingId,
        package_id: packageId,
      }));

      const { error } = await supabase.from('booking_packages').upsert(rows, { onConflict: 'booking_id,package_id' });
      if (error) throw error;
    } catch (err) {
      console.warn('booking_packages table unavailable, falling back to primary package link.', err?.message || err);
    }
  };

  const syncBookingSupplierLinks = async (bookingId, supplierIds) => {
    if (!bookingId || !supabase || !supplierIds.length) return;

    try {
      const rows = supplierIds.map((supplierId) => ({
        booking_id: bookingId,
        supplier_id: supplierId,
      }));

      const { error } = await supabase.from('booking_suppliers').upsert(rows, { onConflict: 'booking_id,supplier_id' });
      if (error) throw error;
    } catch (err) {
      console.warn('booking_suppliers table unavailable, falling back to primary supplier link.', err?.message || err);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!supabase) {
      setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    if (!form.client_id) {
      setError('Please select a client.');
      return;
    }

    const selectedPackageIds = Array.from(
      new Set([
        ...(form.package_ids || []).filter(Boolean),
        ...packageLines.map((line) => line.package_id).filter(Boolean),
      ])
    );
    const validLines = serviceTypeLines.filter((line) => line.service_type_id);
    const validPackageLines = packageLines.filter((line) => line.package_id);
    const allLines = [...validLines, ...validPackageLines];

    for (const line of validLines) {
      const fields = serviceTypeFieldCache[line.service_type_id] || [];
      const missingField = fields.find((field) => {
        if (!field.required) return false;
        const value = line.details?.[field.field_key];
        return value === undefined || value === null || value === '';
      });

      if (missingField) {
        setError(`${missingField.name} is required for ${serviceTypes.find((type) => type.id === line.service_type_id)?.name || 'this service type'}.`);
        return;
      }
    }

    const selectedService = serviceTemplates.find((service) => service.id === form.service_id) || null;
    const resolvedPackageId = selectedPackageIds[0] || form.package_id || selectedService?.package_id || null;
    const totalCostPrice = allLines.reduce((sum, line) => sum + (Number(line.cost_price) || 0), 0);
    const totalSellingPrice = allLines.reduce((sum, line) => sum + (Number(line.selling_price) || 0), 0);
    const linkedSupplierIds = Array.from(new Set(allLines.map((line) => line.supplier_id).filter(Boolean)));
    const bookingFinishDate = form.finish_date || null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bookingStatus =
      bookingFinishDate && new Date(`${bookingFinishDate}T00:00:00`) < today && form.status !== 'cancelled'
        ? 'overdue'
        : form.status || 'pending';
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      client_id: form.client_id,
      co_clients: Array.isArray(form.co_clients) ? form.co_clients.filter(Boolean) : [],
      passengers: Array.isArray(form.passengers) ? form.passengers.filter(Boolean) : [],
      package_id: resolvedPackageId,
      service_id: form.service_id || null,
      cost_price: totalCostPrice,
      selling_price: totalSellingPrice,
      finish_date: bookingFinishDate,
      status: bookingStatus,
      reference: String(form.reference || '').trim() || null,
      note: String(form.note || '').trim() || null,
      agent_id: userData?.user?.id || null,
    };

    try {
      setSaving(true);
      setError('');

      if (selectedBooking?.id) {
        const { error: updateError } = await supabase
          .from('bookings')
          .update(payload)
          .eq('id', selectedBooking.id);

        if (updateError) throw updateError;

        await syncBookingPackageLinks(selectedBooking.id, selectedPackageIds);
        await syncBookingServiceLines(selectedBooking.id, [...validLines, ...validPackageLines]);
        await syncBookingSupplierLinks(selectedBooking.id, linkedSupplierIds);
        await createInvoiceForBooking({ ...selectedBooking, ...payload, id: selectedBooking.id });

        if (payload.service_id) {
          await syncClientServiceAssignment(payload.service_id, payload.client_id);

          await syncBookingTask({
            clientId: payload.client_id,
            supplierId: validLines.find((line) => line.supplier_id)?.supplier_id || null,
            serviceId: payload.service_id,
            packageId: payload.package_id,
            serviceTitle: serviceTemplates.find((service) => service.id === payload.service_id)?.title || 'Linked service task',
            status: payload.status,
          });
        }
      } else {
        const { data: insertedBooking, error: insertError } = await supabase
          .from('bookings')
          .insert([payload])
          .select('id, client_id, package_id, service_id, selling_price')
          .single();

        if (insertError) throw insertError;

        const packageSeatCount = Math.max(1, selectedPackageIds.length || 1);
        if (resolvedPackageId) {
          const { error: stockError } = await decrementPackageStock({
            supabase,
            packageId: resolvedPackageId,
            seatsBooked: packageSeatCount,
          });

          if (stockError) {
            console.warn('Unable to decrement package stock after booking creation:', stockError.message || stockError);
          }
        }

        await syncBookingPackageLinks(insertedBooking.id, selectedPackageIds);
        await syncBookingServiceLines(insertedBooking.id, [...validLines, ...validPackageLines]);
        await syncBookingSupplierLinks(insertedBooking.id, linkedSupplierIds);
        await createInvoiceForBooking(insertedBooking);

        if (payload.service_id) {
          await syncClientServiceAssignment(payload.service_id, payload.client_id);

          await syncBookingTask({
            clientId: payload.client_id,
            supplierId: validLines.find((line) => line.supplier_id)?.supplier_id || null,
            serviceId: payload.service_id,
            packageId: payload.package_id,
            serviceTitle: serviceTemplates.find((service) => service.id === payload.service_id)?.title || 'Linked service task',
            status: payload.status,
          });
        }
      }

      setIsModalOpen(false);
      setSelectedBooking(null);
      setForm(emptyBookingForm);
      setServiceTypeLines([]);
      setPackageLines([]);
      await fetchBookings();

      if (payload.finish_date) {
        notify(
          'Booking saved',
          `Invoice is pending and the client service is ready to be worked. Due date: ${new Date(`${payload.finish_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
          'success',
          '/bookings'
        );
      } else {
        notify('Booking saved', 'Invoice is pending. Please assign a finish date for full tracking.', 'warning', '/bookings');
      }
    } catch (err) {
      setError(err.message || 'Unable to save booking.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      if (!supabase) {
        setError('Supabase is not configured yet.');
        return;
      }

      await supabase.from('booking_service_lines').delete().eq('booking_id', id);
      const { error: deleteError } = await supabase.from('bookings').delete().eq('id', id);
      if (deleteError) throw deleteError;

      await fetchBookings();
    } catch (err) {
      setError(err.message || 'Unable to delete booking.');
    } finally {
      setDeleteBookingTarget(null);
    }
  };

  const handleQuickCreate = async (event) => {
    event.preventDefault();

    if (!supabase) {
      setError('Supabase is not configured yet.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (quickCreateType === 'client') {
        const payload = {
          full_name: quickCreateForm.full_name.trim(),
          phone: quickCreateForm.phone.trim(),
          email: quickCreateForm.email.trim(),
        };

        if (!payload.full_name) {
          throw new Error('Client full name is required.');
        }

        const { data, error: insertError } = await supabase
          .from('clients')
          .insert([payload])
          .select('id, full_name')
          .single();

        if (insertError) throw insertError;

        setClients((prev) => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
        setForm((prev) => ({ ...prev, client_id: data.id }));

        const missingInfo = [!payload.phone ? 'phone' : '', !payload.email ? 'email' : '']
          .filter(Boolean)
          .join(', ');

        notify(
          'Client created',
          missingInfo
            ? `Client created. Please complete the missing client info: ${missingInfo}.`
            : 'Client created successfully. The booking can continue with the new profile.',
          missingInfo ? 'warning' : 'success',
          '/clients'
        );
      }

      if (quickCreateType === 'supplier') {
        const payload = {
          name: quickCreateForm.name.trim(),
          type: quickCreateForm.type === 'Other' ? (quickCreateCustomType.trim() || 'Other') : (quickCreateForm.type.trim() || 'General'),
          phone: quickCreateForm.phone.trim(),
          email: quickCreateForm.email.trim(),
        };

        if (!payload.name) {
          throw new Error('Supplier name is required.');
        }

        const { data, error: insertError } = await supabase
          .from('suppliers')
          .insert([payload])
          .select('id, name')
          .single();

        if (insertError) throw insertError;

        setSuppliers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setForm((prev) => ({ ...prev, supplier_id: data.id }));

        const missingInfo = [!payload.type ? 'type' : '', !payload.phone ? 'phone' : '', !payload.email ? 'email' : '']
          .filter(Boolean)
          .join(', ');

        notify(
          'Supplier created',
          missingInfo
            ? `Supplier created. Please complete the missing supplier info: ${missingInfo}.`
            : 'Supplier created successfully. Supplier debt and payment tracking are now active.',
          missingInfo ? 'warning' : 'success',
          '/suppliers'
        );
      }

      if (quickCreateType === 'package') {
        const payload = {
          title: quickCreateForm.name.trim(),
          price: Number(quickCreateForm.price) || 0,
          supplier_id: quickCreateForm.supplier_id || null,
        };

        if (!payload.title) {
          throw new Error('Package title is required.');
        }

        const { data, error: insertError } = await supabase
          .from('packages')
          .insert([payload])
          .select('id, title, price, supplier_id')
          .single();

        if (insertError) throw insertError;

        setPackages((prev) => [...prev, data].sort((a, b) => (a.title || '').localeCompare(b.title || '')));
        setForm((prev) => ({ ...prev, package_id: data.id, supplier_id: data.supplier_id || prev.supplier_id }));

        const missingInfo = [!data.price ? 'price' : '', !data.supplier_id ? 'supplier' : '']
          .filter(Boolean)
          .join(', ');

        notify(
          'Package created',
          missingInfo
            ? `Package created. Please complete the missing package info: ${missingInfo}.`
            : 'Package created successfully. The booking can now continue without missing fields.',
          missingInfo ? 'warning' : 'success',
          '/packages'
        );
      }

      setQuickCreateType(null);
      setQuickCreateCustomType('');
      setQuickCreateForm({
        full_name: '',
        phone: '',
        email: '',
        name: '',
        type: 'General',
        price: '',
        supplier_id: '',
      });
    } catch (err) {
      setError(err.message || 'Unable to create new record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">{t.eyebrow}</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">{t.title}</h2>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-navy"
        >
          {t.newBooking}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t.totalBookings}</p>
          <p className="mt-3 font-mono text-3xl font-semibold text-brand-navy">{bookingStats.totalBookings}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{t.confirmed}</p>
          <p className="mt-3 font-mono text-3xl font-semibold text-emerald-800">{bookingStats.confirmed}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">{t.pending}</p>
          <p className="mt-3 font-mono text-3xl font-semibold text-amber-800">{bookingStats.pending}</p>
        </div>
        <div className="rounded-2xl border border-brand-gold/30 bg-amber-50 p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-navy">{t.totalRevenue}</p>
          <p className="mt-3 font-mono text-2xl font-semibold text-brand-navy">{formatDzd(bookingStats.totalRevenue)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.search}</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t.clientOrRef || 'Client or booking ref'}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.status}</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
            >
              <option value="all">{t.all}</option>
              <option value="pending">{t.pending}</option>
              <option value="confirmed">{t.confirmed}</option>
              <option value="processing">{t.processing}</option>
              <option value="cancelled">{t.cancelled}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.fromDate}</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.toDate}</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
            />
          </div>

          <div className="lg:col-span-5">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.serviceType}</label>
            <select
              value={serviceTypeFilter}
              onChange={(event) => setServiceTypeFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
            >
              <option value="all">{t.allServiceTypes}</option>
              {serviceTypes.map((serviceType) => (
                <option key={serviceType.id} value={serviceType.name}>{serviceType.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-navy p-2 text-brand-gold">
              <BriefcaseBusiness size={18} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-brand-navy">{t.overview}</h3>
              <p className="text-sm text-slate-500">{t.overviewSubtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-brand-surface px-3 py-2 text-sm text-brand-navy">
              <input
                type="checkbox"
                checked={showOverdueOnly}
                onChange={(event) => setShowOverdueOnly(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-gold focus:ring-brand-gold"
              />
              {t.overdueOnly}
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-5 py-3">{t.client}</th>
                <th className="px-5 py-3">{t.clientRef}</th>
                <th className="px-5 py-3">{t.serviceTypes}</th>
                <th className="px-5 py-3">{t.suppliers}</th>
                <th className="px-5 py-3">{t.costPrice}</th>
                <th className="px-5 py-3">{t.sellingPrice}</th>
                <th className="px-5 py-3">{t.profit}</th>
                <th className="px-5 py-3">{t.finishDate}</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">{t.status}</th>
                <th className="px-5 py-3 text-right">{t.actions}</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" className="px-5 py-10 text-center text-sm text-slate-500">
                    {t.loading}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-5 py-10 text-center text-sm text-slate-500">
                    {t.noBookings}
                  </td>
                </tr>
              ) : (
                rows.map((booking) => (
                  <tr
                    key={booking.id}
                    className="cursor-pointer border-t border-slate-200 text-sm text-slate-700 transition hover:bg-slate-50"
                    onClick={() => navigate(`/bookings/${booking.id}`)}
                  >
                    <td className="px-5 py-4 font-medium text-brand-navy">{booking.clientName}</td>
                    <td className="px-5 py-4 font-mono text-xs text-brand-navy">{booking.clientRef}</td>
                    <td className="px-5 py-4">
                      {booking.serviceTypeNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {booking.serviceTypeNames.map((name) => (
                            <span key={`${booking.id}-${name}`} className="inline-flex rounded-full bg-brand-surface px-2 py-1 text-[10px] font-medium text-brand-navy">
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {booking.supplierNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {booking.supplierNames.map((name) => (
                            <span key={`${booking.id}-supplier-${name}`} className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800">
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        booking.supplierName
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-brand-navy">{formatDzd(booking.costPrice)}</td>
                    <td className="px-5 py-4 font-mono text-brand-navy">{formatDzd(booking.sellingPrice)}</td>
                    <td className="px-5 py-4 font-mono font-semibold text-brand-gold">{formatDzd(booking.profit)}</td>
                    <td className={`px-5 py-4 ${booking.isLate ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                      {booking.dueLabel}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {booking.created_at ? new Date(booking.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${statusStyles[booking.status] || 'bg-slate-100 text-slate-700'}`}
                      >
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditModal(booking);
                          }}
                          className="rounded-lg bg-brand-surface p-2 text-brand-navy transition hover:bg-slate-200"
                          aria-label={`Edit booking ${booking.id}`}
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setCancelBookingTarget(booking);
                          }}
                          className="rounded-lg bg-amber-50 p-2 text-amber-700 transition hover:bg-amber-100"
                          aria-label={`Cancel booking ${booking.id}`}
                        >
                          <X size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteBookingTarget(booking.id);
                          }}
                          className="rounded-lg bg-red-50 p-2 text-red-600 transition hover:bg-red-100"
                          aria-label={`Delete booking ${booking.id}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteBookingTarget && (
        <SecureDeleteModal
          isOpen={Boolean(deleteBookingTarget)}
          onClose={() => setDeleteBookingTarget(null)}
          onConfirm={() => handleDelete(deleteBookingTarget)}
          title="Delete Booking"
        />
      )}

      {cancelBookingTarget && (
        <CancelBookingModal
          booking={cancelBookingTarget}
          user={null}
          onClose={() => setCancelBookingTarget(null)}
          onSuccess={async () => {
            setCancelBookingTarget(null);
            await fetchBookings();
          }}
        />
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-brand-card p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">
                  {selectedBooking ? t.editBooking : t.createBooking}
                </p>
                <h3 className="mt-2 font-serif text-2xl text-brand-navy">
                  {selectedBooking ? t.bookingDetails : t.newBooking}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedBooking(null);
                  setError('');
                }}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
                aria-label={t.close}
              >
                <X size={20} />
              </button>
            </div>

            {selectedBooking && (
              <div className="mb-5 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Booking Reference: <strong className="text-brand-navy">{selectedBooking.reference || '—'}</strong>
                </span>
                <span>
                  Created on: {selectedBooking.created_at ? new Date(selectedBooking.created_at).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  }) : '—'}
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-brand-navy">{t.selectClient}</label>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickCreateType('client');
                      setQuickCreateForm({ full_name: '', phone: '', email: '', name: '', type: '' });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-brand-surface px-2.5 py-1.5 text-xs font-semibold text-brand-navy"
                  >
                    <UserPlus size={14} />
                    {t.createNew}
                  </button>
                </div>

                <select
                  value={form.client_id}
                  onChange={(event) => handleFieldChange('client_id', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="">{t.chooseClient}</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-brand-navy">Co-Payers / Additional Clients</label>
                  <div className="rounded-xl border border-slate-200 bg-brand-surface p-2.5">
                    <select
                      value=""
                      onChange={(event) => {
                        const selectedClientId = event.target.value;
                        if (!selectedClientId) return;

                        setSelectedCoClients((prev) =>
                          prev.includes(selectedClientId) ? prev : [...prev, selectedClientId]
                        );
                        event.target.value = '';
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                    >
                      <option value="">Select co-payer</option>
                      {clients
                        .filter((client) => client.id !== form.client_id && !selectedCoClients.includes(client.id))
                        .map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.full_name}
                          </option>
                        ))}
                    </select>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedCoClients.length === 0 ? (
                        <p className="text-sm text-slate-500">No co-payers selected.</p>
                      ) : (
                        selectedCoClients.map((coClientId) => {
                          const coClient = clients.find((client) => client.id === coClientId);
                          if (!coClient) return null;

                          return (
                            <span
                              key={coClient.id}
                              className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-800"
                            >
                              {coClient.full_name}
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedCoClients((prev) => prev.filter((id) => id !== coClient.id))
                                }
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-600 transition hover:bg-slate-300"
                                aria-label={`Remove ${coClient.full_name}`}
                              >
                                <span className="text-xs">×</span>
                              </button>
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-full mt-4 space-y-2">
                <label className="block text-sm font-medium text-brand-navy">Travelers</label>
                <div className="rounded-xl border border-slate-200 bg-brand-surface p-3">
                  {availableTravelers.length === 0 ? (
                    <p className="text-sm text-slate-500">Select a client to add travelers.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {availableTravelers.map((traveler) => (
                        <label
                          key={traveler.id}
                          className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 accent-[#c9a84c]"
                            checked={selectedPassengers.some((passenger) => passenger.id === traveler.id)}
                            onChange={(e) => handlePassengerToggle(traveler, e.target.checked)}
                          />
                          <div className="flex flex-col">
                            <span className="whitespace-nowrap text-sm font-bold text-[#0a1120]">{traveler.name}</span>
                            <span className="text-xs text-slate-500">{traveler.type}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Cost Price / سعر التكلفة</label>
                  <input
                    type="text"
                    value={bookingTotals.costPrice.toLocaleString('fr-DZ', { maximumFractionDigits: 2 })}
                    readOnly
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-brand-navy outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Selling Price / سعر البيع</label>
                  <input
                    type="text"
                    value={bookingTotals.sellingPrice.toLocaleString('fr-DZ', { maximumFractionDigits: 2 })}
                    readOnly
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-brand-navy outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Profit / الربح</label>
                  <input
                    type="text"
                    value={bookingTotals.profit.toLocaleString('fr-DZ', { maximumFractionDigits: 2 })}
                    readOnly
                    className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-base font-semibold text-amber-700 outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-brand-navy">Service Types</label>
                  <button
                    type="button"
                    onClick={() => setIsServiceTypePickerOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-brand-surface px-2.5 py-1.5 text-xs font-semibold text-brand-navy"
                  >
                    <Plus size={14} />
                    Add Service Type
                  </button>
                </div>

                {isServiceTypePickerOpen && (
                  <div className="mb-3 rounded-2xl border border-slate-200 bg-brand-surface p-3">
                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <Search size={14} className="text-slate-400" />
                      <input
                        autoFocus
                        value={serviceTypeSearch}
                        onChange={(event) => setServiceTypeSearch(event.target.value)}
                        placeholder="Search service types..."
                        className="w-full bg-transparent text-sm text-brand-navy outline-none"
                      />
                    </div>

                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {serviceTypes
                        .filter((type) => type.name.toLowerCase().includes(serviceTypeSearch.trim().toLowerCase()))
                        .map((type) => (
                          <button
                            key={type.id}
                            type="button"
                            onClick={() => addServiceTypeLine(type.id)}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-brand-navy transition hover:bg-slate-100"
                          >
                            {type.name}
                          </button>
                        ))}
                      {serviceTypes.length === 0 && (
                        <p className="px-3 py-2 text-sm text-slate-500">No service types yet. Create one on the Service Types page.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {serviceTypeLines.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-brand-surface px-3 py-3 text-sm text-slate-500">
                      No service type lines added yet.
                    </p>
                  ) : (
                    serviceTypeLines.map((line) => {
                      const typeName = serviceTypes.find((type) => type.id === line.service_type_id)?.name || 'Service type';
                      const lineSuppliers = getSuppliersForServiceType(line.service_type_id);

                      return (
                        <div key={line.lineId} className="rounded-2xl border border-slate-200 bg-brand-surface p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-brand-navy">{typeName}</span>
                            <button
                              type="button"
                              onClick={() => removeServiceTypeLine(line.lineId)}
                              className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600"
                              aria-label="Remove service type line"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          <div className="grid gap-2 md:grid-cols-4">
                            <select
                              value={line.supplier_id}
                              onChange={(event) => updateServiceTypeLine(line.lineId, 'supplier_id', event.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            >
                              <option value="">Select supplier</option>
                              {lineSuppliers.map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                              ))}
                            </select>

                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.cost_price}
                              onChange={(event) => updateServiceTypeLine(line.lineId, 'cost_price', event.target.value)}
                              placeholder="Cost price (DZD)"
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            />

                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.selling_price}
                              onChange={(event) => updateServiceTypeLine(line.lineId, 'selling_price', event.target.value)}
                              placeholder="Selling price (DZD)"
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            />

                            <select
                              value={Number(line.tva_rate || 0)}
                              onChange={(event) => updateServiceTypeLine(line.lineId, 'tva_rate', Number(event.target.value || 0))}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            >
                              <option value={0}>No TVA (0%)</option>
                              <option value={9}>9%</option>
                              <option value={19}>19%</option>
                            </select>
                          </div>

                          {(serviceTypeFieldCache[line.service_type_id] || []).length > 0 && (
                            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold">Service Details</p>
                              <div className="space-y-3">
                                {(serviceTypeFieldCache[line.service_type_id] || []).map((field) => (
                                  <div key={`${line.lineId}-${field.id}`}>
                                    <label className="mb-1 block text-sm font-medium text-brand-navy">
                                      {field.name}
                                      {field.required && <span className="ml-1 text-red-600">*</span>}
                                    </label>
                                    {renderDynamicFieldInput(line, field)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {packageLinesEnabled && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-brand-navy">Package Lines</label>
                    <button
                      type="button"
                      onClick={() => setIsPackagePickerOpen((prev) => !prev)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-brand-surface px-2.5 py-1.5 text-xs font-semibold text-brand-navy"
                    >
                      <Plus size={14} />
                      Add Package
                    </button>
                  </div>

                  {isPackagePickerOpen && (
                    <div className="mb-3 rounded-2xl border border-slate-200 bg-brand-surface p-3">
                      <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <Search size={14} className="text-slate-400" />
                        <input
                          autoFocus
                          value={packageSearch}
                          onChange={(event) => setPackageSearch(event.target.value)}
                          placeholder="Search package templates..."
                          className="w-full bg-transparent text-sm text-brand-navy outline-none"
                        />
                      </div>

                      <div className="max-h-48 space-y-1 overflow-y-auto">
                        {packageTemplates
                          .filter((template) => {
                            const query = packageSearch.trim().toLowerCase();
                            if (!query) return true;
                            return `${template.label || ''} ${template.destination || ''} ${template.type || ''}`
                              .toLowerCase()
                              .includes(query);
                          })
                          .map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => addPackageLine(template.id)}
                              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-brand-navy transition hover:bg-slate-100"
                            >
                              <div>
                                <div className="font-medium">{template.label || 'Untitled package'}</div>
                                <div className="text-xs text-slate-500">{template.destination || 'No destination'}</div>
                              </div>
                              <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                                {template.type || template.template_type || 'trip'}
                              </span>
                            </button>
                          ))}
                        {packageTemplates.length === 0 && (
                          <p className="px-3 py-2 text-sm text-slate-500">No package templates yet. Create one in the Packages page.</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {packageLines.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-brand-surface px-3 py-3 text-sm text-slate-500">
                        No package lines added yet.
                      </p>
                    ) : (
                      packageLines.map((line) => (
                        <div key={line.lineId} className="rounded-2xl border border-slate-200 bg-brand-surface p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-brand-navy">{line.package_label || 'Package'}</span>
                            <button
                              type="button"
                              onClick={() => removePackageLine(line.lineId)}
                              className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600"
                              aria-label="Remove package line"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          <div className="grid gap-2 md:grid-cols-5">
                            <select
                              value={line.package_id || ''}
                              onChange={(event) => updatePackageLine(line.lineId, 'package_id', event.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            >
                              <option value="">Select package</option>
                              {packageTemplates.map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.label || 'Untitled package'}
                                </option>
                              ))}
                            </select>

                            <select
                              value={line.supplier_id}
                              onChange={(event) => updatePackageLine(line.lineId, 'supplier_id', event.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            >
                              <option value="">Select supplier</option>
                              {suppliers.map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                              ))}
                            </select>

                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.cost_price}
                              onChange={(event) => updatePackageLine(line.lineId, 'cost_price', event.target.value)}
                              placeholder="Cost price (DZD)"
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            />

                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.selling_price}
                              onChange={(event) => updatePackageLine(line.lineId, 'selling_price', event.target.value)}
                              placeholder="Selling price (DZD)"
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            />

                            <select
                              value={Number(line.tva_rate || 0)}
                              onChange={(event) => updatePackageLine(line.lineId, 'tva_rate', Number(event.target.value || 0))}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            >
                              <option value={0}>No TVA (0%)</option>
                              <option value={9}>9%</option>
                              <option value={19}>19%</option>
                            </select>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Reference</label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(event) => handleFieldChange('reference', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    placeholder="Flight, visa, or contract ref"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Status</label>
                  <select
                    value={form.status}
                    onChange={(event) => handleFieldChange('status', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  >
                    <option value="pending">Pending</option>
                    <option value="processing">Processing / قيد المعالجة</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Finish date</label>
                <input
                  type="date"
                  value={form.finish_date}
                  onChange={(event) => handleFieldChange('finish_date', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
                <p className="mt-1 text-xs font-medium text-slate-400">
                  This is the final deadline for the client to fully pay for this booking.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Booking note</label>
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={(event) => handleFieldChange('note', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  placeholder="Add internal booking notes or customer requirements"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedBooking(null);
                    setError('');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
                >
                  {saving ? 'Saving...' : selectedBooking ? 'Save Changes' : 'Create Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {quickCreateType && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-brand-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-2xl text-brand-navy">
                {quickCreateType === 'client' ? 'New Client' : 'New Supplier'}
              </h3>
              <button
                type="button"
                onClick={() => setQuickCreateType(null)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickCreate} className="space-y-4">
              {quickCreateType === 'client' ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Full name</label>
                    <input
                      value={quickCreateForm.full_name}
                      onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, full_name: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Phone</label>
                    <input
                      value={quickCreateForm.phone}
                      onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Email</label>
                    <input
                      type="email"
                      value={quickCreateForm.email}
                      onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>
                </>
              ) : quickCreateType === 'supplier' ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Supplier name</label>
                    <input
                      value={quickCreateForm.name}
                      onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Type</label>
                    <select
                      value={quickCreateForm.type || 'General'}
                      onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, type: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    >
                      {supplierTypeOptions.map((typeOption) => (
                        <option key={typeOption} value={typeOption}>
                          {typeOption}
                        </option>
                      ))}
                    </select>

                    {quickCreateForm.type === 'Other' && (
                      <input
                        value={quickCreateCustomType}
                        onChange={(event) => setQuickCreateCustomType(event.target.value)}
                        placeholder="Enter custom supplier type"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                      />
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Phone</label>
                    <input
                      value={quickCreateForm.phone}
                      onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Email</label>
                    <input
                      type="email"
                      value={quickCreateForm.email}
                      onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Package title</label>
                    <input
                      value={quickCreateForm.name}
                      onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Price (DZD)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={quickCreateForm.price}
                      onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, price: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Supplier</label>
                    <select
                      value={quickCreateForm.supplier_id}
                      onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, supplier_id: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    >
                      <option value="">No supplier selected</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickCreateType(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
