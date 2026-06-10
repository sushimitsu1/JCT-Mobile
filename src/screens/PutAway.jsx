import { useState } from 'react'
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import BarcodeScanner from '../components/BarcodeScanner'
import {
  Truck, ScanLine, CheckCircle, ArrowLeft, Package, XCircle, MapPin,
  Edit3, RefreshCw
} from 'lucide-react'

const PICKER_NAME_KEY = 'jct-mobile-picker-name'
const getStoredPicker = () => localStorage.getItem(PICKER_NAME_KEY) || ''

export default function PutAway() {
  const [step, setStep] = useState('scanPallet')  // scanPallet | scanLocation | done
  const [scanning, setScanning] = useState(false)
  const [pallet, setPallet] = useState(null)
  const [newLocation, setNewLocation] = useState('')
  const [manualEntry, setManualEntry] = useState(false)
  const [manualPalletId, setManualPalletId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  // ─── Look up pallet by ID ──────────────────────────────────────
  const lookupPallet = async (palletId) => {
    setError(''); setSuccess('')
    const id = String(palletId || '').trim()
    if (!id) return
    try {
      const snap = await getDocs(query(collection(db, 'inventory'), where('palletId', '==', id)))
      if (snap.empty) {
        setError(`No pallet found with ID "${id}".`)
        return
      }
      const doc0 = snap.docs[0]
      setPallet({ id: doc0.id, ...doc0.data() })
      setNewLocation('')
      setStep('scanLocation')
    } catch (e) {
      console.error(e)
      setError('Failed to look up pallet.')
    }
  }

  const handlePalletScan = (code) => {
    setScanning(false)
    lookupPallet(code)
  }

  const handleLocationScan = (code) => {
    setScanning(false)
    setNewLocation(String(code || '').trim().toUpperCase())
  }

  // ─── Save the new location ─────────────────────────────────────
  const savePutAway = async () => {
    if (!pallet) return
    const loc = newLocation.trim().toUpperCase()
    if (!loc) { setError('Enter a destination location first.'); return }
    setSaving(true); setError('')
    try {
      const fromLocation = pallet.location || ''
      await updateDoc(doc(db, 'inventory', pallet.id), {
        location: loc,
        lastMovedAt: new Date().toISOString(),
      })
      // Audit log
      try {
        await addDoc(collection(db, 'palletHistory'), {
          action: 'move',
          palletId: pallet.palletId,
          sku: pallet.sku,
          fromLocation,
          toLocation: loc,
          unitsChange: 0,
          timestamp: serverTimestamp(),
          userName: getStoredPicker() || 'Mobile',
          notes: 'Put away via mobile',
        })
      } catch (e) {
        console.warn('palletHistory write failed (non-blocking)', e)
      }
      setSuccess(`✓ ${pallet.palletId} → ${loc}`)
      setStep('done')
    } catch (e) {
      console.error(e)
      setError('Failed to save. Check connection.')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setPallet(null); setNewLocation(''); setError(''); setSuccess('')
    setManualPalletId(''); setManualEntry(false)
    setStep('scanPallet')
  }

  // ─── Scanner view ──────────────────────────────────────────────
  if (scanning) {
    return (
      <BarcodeScanner
        title={step === 'scanPallet' ? 'Scan Pallet Label' : 'Scan Location'}
        onScan={step === 'scanPallet' ? handlePalletScan : handleLocationScan}
        onClose={() => setScanning(false)}
      />
    )
  }

  // ─── Done view (just placed a pallet) ──────────────────────────
  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center pb-4">
        <CheckCircle size={56} className="text-green-500" />
        <h2 className="text-xl font-bold text-gray-800">Pallet Placed</h2>
        <p className="text-gray-500 text-sm">{success}</p>
        {pallet && (
          <div className="bg-white rounded-xl shadow-sm p-4 w-full mt-2">
            <p className="text-xs text-gray-400 uppercase mb-1">Just put away</p>
            <p className="text-sm font-bold text-gray-800 font-mono">{pallet.palletId}</p>
            <p className="text-xs text-gray-500">{pallet.sku} · {pallet.description}</p>
            <p className="text-xs text-gray-500 mt-1">
              {pallet.location || '—'} <span className="text-gray-300">→</span> <span className="font-semibold text-gray-700">{newLocation}</span>
            </p>
          </div>
        )}
        <button onClick={reset}
          className="mt-2 w-full bg-jct-navy text-white py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-2">
          <Truck size={18} /> Put Away Next Pallet
        </button>
      </div>
    )
  }

  // ─── Scan-location view (pallet already identified) ────────────
  if (step === 'scanLocation' && pallet) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={reset} className="text-gray-400"><ArrowLeft size={20} /></button>
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-800">Put Away</h2>
            <p className="text-xs text-gray-400">Step 2 of 2 · Scan destination</p>
          </div>
        </div>

        {/* Pallet card */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-400 uppercase">Pallet</p>
              <p className="text-lg font-bold text-gray-800 font-mono">{pallet.palletId}</p>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600">
              {pallet.units || pallet.qty || 0} units
            </span>
          </div>
          <div className="border-t border-gray-100 pt-2">
            <p className="text-sm font-semibold text-gray-700">{pallet.sku}</p>
            <p className="text-xs text-gray-500 truncate">{pallet.description}</p>
            <p className="text-xs text-gray-400 mt-1">{pallet.clientName}</p>
          </div>
          {pallet.location && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin size={11} /> Currently at <span className="font-mono font-semibold">{pallet.location}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <XCircle size={16} /> {error}
          </div>
        )}

        {/* Destination input */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
            Destination Location
          </label>
          <input
            type="text"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value.toUpperCase())}
            placeholder="e.g. A-12-03"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base font-mono uppercase focus:outline-none focus:border-jct-red"
          />
          <button onClick={() => setScanning(true)}
            className="w-full mt-2 bg-jct-red text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
            <ScanLine size={18} /> Scan Location Label
          </button>
        </div>

        <button onClick={savePutAway} disabled={!newLocation.trim() || saving}
          className="w-full bg-green-600 text-white py-3.5 rounded-xl font-semibold text-base disabled:opacity-40">
          {saving ? 'Saving…' : '✓ Confirm Put Away'}
        </button>
      </div>
    )
  }

  // ─── Scan-pallet view (starting state) ─────────────────────────
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-2">
        <Truck size={20} className="text-jct-navy" />
        <h2 className="text-base font-bold text-gray-800">Put Away</h2>
      </div>
      <p className="text-xs text-gray-500 -mt-2">
        Scan the pallet label, then scan its destination location.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <XCircle size={16} /> {error}
        </div>
      )}

      {/* Big scan button */}
      <button onClick={() => setScanning(true)}
        className="bg-jct-red text-white py-6 rounded-xl font-semibold text-lg flex flex-col items-center justify-center gap-2 shadow-sm">
        <ScanLine size={36} />
        Scan Pallet Label
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">or</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {!manualEntry && (
        <button onClick={() => setManualEntry(true)}
          className="w-full flex items-center justify-center gap-2 text-gray-500 text-sm py-2">
          <Edit3 size={14} /> Enter pallet ID manually
        </button>
      )}

      {manualEntry && (
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pallet ID</label>
          <input
            autoFocus
            type="text"
            value={manualPalletId}
            onChange={(e) => setManualPalletId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') lookupPallet(manualPalletId) }}
            placeholder="e.g. 23485"
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-base font-mono focus:outline-none focus:border-jct-red"
          />
          <button onClick={() => lookupPallet(manualPalletId)}
            disabled={!manualPalletId.trim()}
            className="w-full bg-jct-navy text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40">
            Look Up
          </button>
        </div>
      )}

      <div className="bg-blue-50 rounded-xl px-4 py-3 mt-2">
        <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
          <Package size={12} /> Tip
        </p>
        <p className="text-xs text-blue-500 mt-0.5">
          The pallet label is printed from a confirmed receipt in the desktop WMS.
        </p>
      </div>
    </div>
  )
}
