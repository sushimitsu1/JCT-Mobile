import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc, query, orderBy, where } from 'firebase/firestore'
import { db } from '../firebase'
import BarcodeScanner from '../components/BarcodeScanner'
import {
  Layers, ScanLine, CheckCircle, Clock, ChevronRight, ArrowLeft,
  Package, XCircle, MapPin, Hand
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────
const PICKER_NAME_KEY = 'jct-mobile-picker-name'
const getStoredPicker = () => localStorage.getItem(PICKER_NAME_KEY) || ''
const setStoredPicker = (name) => localStorage.setItem(PICKER_NAME_KEY, name)

export default function Waves() {
  const [view, setView] = useState('list')        // 'list' | 'detail' | 'scanning'
  const [waves, setWaves] = useState([])
  const [waveOrders, setWaveOrders] = useState({})  // waveId → orders[]
  const [selected, setSelected] = useState(null)
  const [pickerName, setPickerName] = useState(getStoredPicker())
  const [showPickerPrompt, setShowPickerPrompt] = useState(false)
  const [pendingWaveAction, setPendingWaveAction] = useState(null)
  const [scanError, setScanError] = useState('')
  const [scanSuccess, setScanSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadWaves() }, [])

  const loadWaves = async () => {
    setLoading(true)
    setError('')
    try {
      const snap = await getDocs(query(collection(db, 'waves'), orderBy('createdAt', 'desc')))
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const filtered = all.filter(w =>
        w.status === 'pending' ||
        (w.status === 'picking' && (!pickerName || w.pickedByName === pickerName))
      )
      setWaves(filtered)

      // Pre-fetch orders for each wave (for pallet counts in list)
      const ordersByWave = {}
      for (const w of filtered) {
        if (!w.orderIds?.length) { ordersByWave[w.id] = []; continue }
        const orderDocs = await Promise.all(
          w.orderIds.map(id => getDocs(query(collection(db, 'orders'), where('__name__', '==', id))))
        )
        ordersByWave[w.id] = orderDocs.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
      }
      setWaveOrders(ordersByWave)
    } catch (e) {
      console.error(e)
      setError('Failed to load waves.')
    } finally {
      setLoading(false)
    }
  }

  // Flatten all pallet allocations across a wave's orders
  const getPalletList = (wave) => {
    const orders = waveOrders[wave.id] || []
    const pallets = []
    orders.forEach(o => {
      (o.inventoryAllocations || []).forEach(a => {
        pallets.push({
          palletId: a.palletId,
          sku: a.sku,
          units: Number(a.unitsAllocated || 0),
          location: a.location || '-',
          orderId: o.id,
          orderRef: o.orderNumber || o.id.slice(-6).toUpperCase(),
        })
      })
    })
    return pallets
  }

  const isPicked = (wave, palletId) => (wave.pickedPalletIds || []).includes(palletId)

  // ─── Claim a wave (sets pickedBy/pickedByName, status → picking) ─
  const claimWave = async (wave, picker) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'waves', wave.id), {
        status: 'picking',
        pickedByName: picker,
        pickedPalletIds: [],
        claimedAt: new Date().toISOString(),
      })
      const updated = { ...wave, status: 'picking', pickedByName: picker, pickedPalletIds: [] }
      setWaves(prev => prev.map(w => w.id === wave.id ? updated : w))
      openWave(updated)
    } catch (e) {
      setError('Failed to claim wave.')
    } finally { setSaving(false) }
  }

  const handleClaimClick = (wave) => {
    if (!pickerName) {
      setPendingWaveAction({ type: 'claim', wave })
      setShowPickerPrompt(true)
      return
    }
    claimWave(wave, pickerName)
  }

  const openWave = (wave) => {
    setSelected(wave)
    setScanError(''); setScanSuccess('')
    setView('detail')
  }

  // ─── Scan a pallet ──────────────────────────────────────────────
  const handleScan = async (barcode) => {
    setScanError(''); setScanSuccess('')
    const pallets = getPalletList(selected)
    const match = pallets.find(p => p.palletId === barcode)
    if (!match) {
      setScanError(`Pallet "${barcode}" is not in this wave.`)
      setView('detail'); return
    }
    if (isPicked(selected, match.palletId)) {
      setScanError(`Pallet ${match.palletId} already confirmed.`)
      setView('detail'); return
    }

    // Optimistic update + write to Firestore
    const newIds = [...(selected.pickedPalletIds || []), match.palletId]
    try {
      await updateDoc(doc(db, 'waves', selected.id), { pickedPalletIds: newIds })
      const updated = { ...selected, pickedPalletIds: newIds }
      setSelected(updated)
      setWaves(prev => prev.map(w => w.id === updated.id ? updated : w))
      setScanSuccess(`✓ ${match.palletId} (${match.sku}, ${match.units} units)`)
    } catch (e) {
      setScanError('Failed to save. Check connection.')
    }
    setView('detail')
  }

  // ─── Stage the wave (all pallets picked) ────────────────────────
  const stageWave = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'waves', selected.id), {
        status: 'staged',
        stagedAt: new Date().toISOString(),
      })
      setWaves(prev => prev.filter(w => w.id !== selected.id))
      setView('list')
      setSelected(null)
    } catch (e) {
      setScanError('Failed to stage wave.')
    } finally { setSaving(false) }
  }

  const allPicked = (wave) => {
    const pallets = getPalletList(wave)
    if (!pallets.length) return false
    return pallets.every(p => isPicked(wave, p.palletId))
  }

  // ─── Picker name prompt ─────────────────────────────────────────
  if (showPickerPrompt) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-bold text-gray-800 mb-1">Who's picking?</h2>
          <p className="text-xs text-gray-500 mb-4">Used to assign waves to you</p>
          <input
            autoFocus
            type="text"
            value={pickerName}
            onChange={(e) => setPickerName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && pickerName.trim()) confirmPicker() }}
            placeholder="Your name"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-jct-red"
          />
          <button onClick={confirmPicker} disabled={!pickerName.trim()}
            className="w-full mt-3 bg-jct-red text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40">
            Continue
          </button>
          <button onClick={() => { setShowPickerPrompt(false); setPendingWaveAction(null) }}
            className="w-full mt-2 text-gray-400 text-sm py-2">Cancel</button>
        </div>
      </div>
    )
  }

  function confirmPicker() {
    const name = pickerName.trim()
    if (!name) return
    setStoredPicker(name)
    setShowPickerPrompt(false)
    if (pendingWaveAction?.type === 'claim') {
      claimWave(pendingWaveAction.wave, name)
    }
    setPendingWaveAction(null)
  }

  // ─── Scanner view ───────────────────────────────────────────────
  if (view === 'scanning') {
    return <BarcodeScanner title="Scan Pallet" onScan={handleScan} onClose={() => setView('detail')} />
  }

  // ─── Wave detail / pick view ────────────────────────────────────
  if (view === 'detail' && selected) {
    const pallets = getPalletList(selected)
    const pickedCount = pallets.filter(p => isPicked(selected, p.palletId)).length
    const done = allPicked(selected)

    // Group pallets by location for picking efficiency
    const byLocation = {}
    pallets.forEach(p => {
      if (!byLocation[p.location]) byLocation[p.location] = []
      byLocation[p.location].push(p)
    })

    return (
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-gray-400"><ArrowLeft size={20} /></button>
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-800">Wave {selected.waveNumber}</h2>
            <p className="text-xs text-gray-400">{selected.pickedByName} · {selected.orderIds?.length || 0} orders</p>
          </div>
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-600">
            {selected.status}
          </span>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Pick progress</span>
            <span>{pickedCount} / {pallets.length} pallets</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-jct-red rounded-full transition-all"
              style={{ width: pallets.length ? `${(pickedCount / pallets.length) * 100}%` : '0%' }} />
          </div>
        </div>

        {scanSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <CheckCircle size={16} /> {scanSuccess}
          </div>
        )}
        {scanError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <XCircle size={16} /> {scanError}
          </div>
        )}

        {/* Pallets grouped by location */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {Object.entries(byLocation).map(([loc, pals]) => (
            <div key={loc}>
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <MapPin size={12} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-600 font-mono">{loc}</span>
                <span className="text-xs text-gray-400">· {pals.length} pallet{pals.length !== 1 ? 's' : ''}</span>
              </div>
              {pals.map((p, i) => {
                const picked = isPicked(selected, p.palletId)
                return (
                  <div key={p.palletId + i}
                    className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${picked ? 'bg-green-50' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${picked ? 'bg-green-100' : 'bg-gray-100'}`}>
                      {picked
                        ? <CheckCircle size={16} className="text-green-600" />
                        : <Package size={16} className="text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate font-mono">{p.palletId}</p>
                      <p className="text-xs text-gray-400 truncate">{p.sku} · {p.orderRef}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-sm font-bold ${picked ? 'text-green-600' : 'text-gray-800'}`}>{p.units}</span>
                      <p className="text-xs text-gray-400">units</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <button onClick={() => { setScanError(''); setScanSuccess(''); setView('scanning') }}
          className="w-full bg-jct-red text-white py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-2">
          <ScanLine size={20} /> Scan Pallet
        </button>

        {done && (
          <button onClick={stageWave} disabled={saving}
            className="w-full bg-green-600 text-white py-3.5 rounded-xl font-semibold text-base disabled:opacity-50">
            {saving ? 'Saving...' : '✓ Mark Wave Staged'}
          </button>
        )}
      </div>
    )
  }

  // ─── Wave list ──────────────────────────────────────────────────
  const myActiveWaves = waves.filter(w => w.status === 'picking' && w.pickedByName === pickerName)
  const pendingWaves = waves.filter(w => w.status === 'pending')

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={20} className="text-jct-navy" />
          <h2 className="text-base font-bold text-gray-800">Waves</h2>
        </div>
        <button onClick={loadWaves} className="text-xs text-jct-blue font-medium">Refresh</button>
      </div>

      {pickerName && (
        <p className="text-xs text-gray-400 -mt-2">
          Picking as <span className="font-semibold text-gray-600">{pickerName}</span>
          {' · '}
          <button onClick={() => setShowPickerPrompt(true)} className="text-jct-blue underline">change</button>
        </p>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      {loading && <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Loading...</div>}

      {!loading && waves.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <CheckCircle size={40} className="text-green-400" />
          <p className="text-gray-500 font-medium">No waves to pick</p>
        </div>
      )}

      {myActiveWaves.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide -mb-2">Your Active</p>
          {myActiveWaves.map(w => <WaveCard key={w.id} wave={w} orders={waveOrders[w.id] || []} onClick={() => openWave(w)} active />)}
        </>
      )}

      {pendingWaves.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide -mb-2 mt-2">Available</p>
          {pendingWaves.map(w => <WaveCard key={w.id} wave={w} orders={waveOrders[w.id] || []} onClick={() => handleClaimClick(w)} />)}
        </>
      )}
    </div>
  )
}

function WaveCard({ wave, orders, onClick, active = false }) {
  const palletCount = orders.reduce((s, o) => s + (o.inventoryAllocations?.length || 0), 0)
  const unitCount = orders.reduce((s, o) =>
    s + (o.inventoryAllocations || []).reduce((ss, a) => ss + Number(a.unitsAllocated || 0), 0), 0)
  const pickedCount = (wave.pickedPalletIds || []).length

  return (
    <button onClick={onClick} className="w-full bg-white rounded-xl shadow-sm p-4 flex items-center gap-3 text-left">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'bg-blue-100' : 'bg-yellow-100'}`}>
        {active
          ? <Layers size={18} className="text-blue-600" />
          : <Hand size={18} className="text-yellow-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-800 truncate">Wave {wave.waveNumber}</p>
        <p className="text-xs text-gray-400 truncate">
          {orders.length} order{orders.length !== 1 ? 's' : ''} · {palletCount} pallets · {unitCount.toLocaleString()} units
        </p>
        {active && palletCount > 0 && (
          <p className="text-xs text-blue-600 font-semibold mt-0.5">{pickedCount}/{palletCount} picked</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${active ? 'bg-blue-100 text-blue-600' : 'bg-yellow-100 text-yellow-600'}`}>
          {active ? 'picking' : 'claim'}
        </span>
        <ChevronRight size={16} className="text-gray-300" />
      </div>
    </button>
  )
}
