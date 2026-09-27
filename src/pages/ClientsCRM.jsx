import { useEffect, useMemo, useState } from 'react';
import { Mail, Phone, Search, UserPlus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ClientsCRM() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchClients = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase) {
          setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.');
          setClients([]);
          return;
        }

        const { data, error } = await supabase
          .from('clients')
          .select('id, full_name, phone, email, passport_number, notes')
          .order('full_name', { ascending: true });

        if (error) throw error;

        setClients(data || []);
      } catch (err) {
        setError(err.message || 'Unable to load clients.');
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, []);

  const filteredClients = useMemo(() => {
    return clients.filter((client) =>
      client.full_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [clients, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">
            CRM
          </p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">Clients</h2>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-navy shadow-sm transition hover:bg-brand-goldHover"
        >
          <UserPlus size={18} />
          New Client
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search clients by name"
            className="w-full rounded-xl border border-slate-200 bg-brand-surface py-3 pl-10 pr-4 text-brand-navy outline-none ring-0 transition placeholder:text-slate-400 focus:border-brand-gold"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Passport</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading clients...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="4" className="px-5 py-10 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-5 py-10 text-center text-sm text-slate-500">
                    No clients found.
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => setSelectedClient(client)}
                    className="cursor-pointer border-t border-slate-200 transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-medium text-brand-navy">{client.full_name}</td>
                    <td className="px-5 py-4 text-slate-700">{client.phone || '—'}</td>
                    <td className="px-5 py-4 text-slate-700">{client.email || '—'}</td>
                    <td className="px-5 py-4 text-slate-700">{client.passport_number || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedClient && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-sm">
          <div className="h-full w-full max-w-md transform border-l border-slate-200 bg-brand-card p-6 shadow-2xl transition-transform duration-300">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">
                  Client details
                </p>
                <h3 className="mt-2 font-serif text-2xl text-brand-navy">
                  {selectedClient.full_name}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedClient(null)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
                aria-label="Close client details"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div className="flex items-center gap-3 rounded-xl bg-brand-surface p-3">
                <Phone className="text-brand-navy" size={18} />
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Phone</p>
                  <p className="text-sm font-medium text-brand-navy">
                    {selectedClient.phone || 'Not provided'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-brand-surface p-3">
                <Mail className="text-brand-navy" size={18} />
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Email</p>
                  <p className="text-sm font-medium text-brand-navy">
                    {selectedClient.email || 'Not provided'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-brand-surface p-3">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Passport Number</p>
                <p className="mt-2 text-sm font-medium text-brand-navy">
                  {selectedClient.passport_number || 'Not provided'}
                </p>
              </div>

              <div className="rounded-xl bg-brand-surface p-3">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Notes</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-brand-navy">
                  {selectedClient.notes || 'No notes added.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
