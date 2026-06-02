import { useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import BarcodeScanner from '../components/BarcodeScanner'
import {
  Boxes, ScanLine, Search, ArrowLeft,
  MapPin, Package, User, X
} from 'lucide-react'

export default function Inventory() {
  const [view, setView] = useState('search')   // 'search' | 'scanning' | 'results'
  const [searchText, setSearchText] = useState('')
  const [results, setResults] = useState([])
  const [searchedSku, setSearchedSku] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const lookup = async (sku) => {
    if (!sku.trim()) return
    setLoading(true)
    setError('')
    setResults([])
    setSearchedSku(sku.trim())
    try {
      // Search inventory collection by sku field
      const snap = await getDocs(
        query(collection(db, 'inventory'), where('sku', '==', sku.trim()))
      )
      let found = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // If nothing found by exact sku, try skuId
      if (found.length === 0) {
        const snap2 = await getDocs(
          query(collection(db, 'inventory'), where('skuId', '==', sku.trim()))
        )
        found = snap2.docs.map(d => ({ id: d.id, ...d.data() }))
      }

      setResults(found)
      if (found.length === 0) setError(`No inventory found for "${sku.trim()}"`)
      setView('results')
    } catch (e) {
      setError('Failed to search inventory. Check your connection.')
      setView('results')
    } finally {
      setLoading(false)
    }
  }

  const handleScan = (barcode) => {
    setSearchText(barcode)
    lookup(barcode)
  }

  const totalQty = results.reduce((sum, r) => sum + (r.qty || 0), 0)
  const totalPallets = results.reduce((sum, r) => sum + (r.pallets || 0), 0)

  // ─── Scanner ────────────────────────────────────────────────────
  if (view === 'scanning') {
    return (
      <BarcodeScanner
        title="Scan Item"
        onScan={handleScan}
        onClose={() => setView('search')}
      />
    )
  }

  // ─── Results ────────────────────────────────────────────────────
  if (view === 'results') {
    return (
      <div className="flex flex-col gap-4 pb-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setView('search'); setResults([]); setError('') }}
            className="text-gray-400">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-800">{searchedSku}</h2>
            <p className="text-xs text-gray-400">
              {results.length > 0
                ? `${results.length} location${results.length !== 1 ? 's' : ''}`
                : 'No results'}
            </p>
          </div>
          <button onClick={() => setView('scanning')}
            className="bg-jct-red text-white p-2 rounded-lg">
            <ScanLine size={18} />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
            Searching...
          </div>
        )}

        {/* Summary card */}
        {results.length > 0 && (
          <div className="bg-jct-navy rounded-xl p-4 flex gap-4">
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold text-white">{totalQty}</p>
              <p className="text-xs text-gray-400 mt-0.5">Total Units</p>
            </div>
            <div className="w-px bg-gray-700" />
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold text-white">{totalPallets}</p>
              <p className="text-xs text-gray-400 mt-0.5">Total Pallets</p>
            </div>
            <div className="w-px bg-gray-700" />
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold text-white">{results.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Locations</p>
            </div>
          </div>
        )}

        {/* Result cards */}
        {results.map((r, i) => (
          <div key={r.id || i} className="bg-white rounded-xl shadow-sm p-4 flex flex-col gap-3">
            {/* Client + condition */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User size={14} className="text-gray-400" />
                <span className="text-sm font-semibold text-gray-700">
                  {r.clientName || r.clientId || '—'}
                </span>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                r.condition === 'A' ? 'bg-green-100 text-green-600' :
                r.condition === 'B' ? 'bg-yellow-100 text-yellow-600' :
                'bg-red-100 text-red-600'
              }`}>
                Cond. {r.condition || '—'}
              </span>
            </div>

            {/* Stats row */}
            <div className="flex gap-3">
              <div className="flex-1 bg-gray-50 rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-gray-800">{r.qty || 0}</p>
                <p className="text-xs text-gray-400">Units</p>
              </div>
              <div className="flex-1 bg-gray-50 rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-gray-800">{r.pallets || 0}</p>
                <p className="text-xs text-gray-400">Pallets</p>
              </div>
              <div className="flex-1 bg-gray-50 rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-gray-800">{r.status || '—'}</p>
                <p className="text-xs text-gray-400">Status</p>
              </div>
            </div>

            {/* Location */}
            {r.location && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin size={14} className="text-jct-red flex-shrink-0" />
                <span className="font-medium">{r.location}</span>
              </div>
            )}

            {/* Receipt ref */}
            {r.receiptNumber && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Package size={12} />
                <span>Receipt: {r.receiptNumber}</span>
                {r.receivedDate && <span>· {r.receivedDate}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  // ─── Search view ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-2">
        <Boxes size={20} className="text-jct-navy" />
        <h2 className="text-base font-bold text-gray-800">Inventory Lookup</h2>
      </div>

      {/* Search bar */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col gap-3">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Search by SKU
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookup(searchText)}
              placeholder="Enter SKU..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-8 py-2.5 text-sm text-gray-800"
            />
            {searchText.length > 0 && (
              <button onClick={() => setSearchText('')}
                className="absolute right-3 top-3 text-gray-300">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => lookup(searchText)}
            disabled={loading || !searchText.trim()}
            className="bg-jct-navy text-white px-4 rounded-lg font-semibold text-sm disabled:opacity-40">
            {loading ? '...' : 'Go'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        <button
          onClick={() => setView('scanning')}
          className="w-full bg-jct-red text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
          <ScanLine size={18} /> Scan Barcode
        </button>
      </div>

      {/* Quick tip */}
      <div className="bg-blue-50 rounded-xl px-4 py-3">
        <p className="text-xs text-blue-600 font-medium">Tip</p>
        <p className="text-xs text-blue-500 mt-0.5">
          Scan any item's barcode to instantly see stock levels, locations, and pallet counts across all clients.
        </p>
      </div>
    </div>
  )
}