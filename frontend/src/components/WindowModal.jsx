import { useEffect, useRef, useState } from 'react'

const minimizedDockIds = []
const dockSubscribers = new Set()
let windowModalCounter = 0

function notifyDockSubscribers() {
  dockSubscribers.forEach(fn => fn())
}

function addToDock(id) {
  if (minimizedDockIds.includes(id)) return
  minimizedDockIds.push(id)
  notifyDockSubscribers()
}

function removeFromDock(id) {
  const idx = minimizedDockIds.indexOf(id)
  if (idx === -1) return
  minimizedDockIds.splice(idx, 1)
  notifyDockSubscribers()
}

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

export default function WindowModal({
  open,
  title,
  onClose,
  children,
  iconName = 'dock_to_right',
  iconWrapClassName = 'bg-blue-100',
  iconClassName = 'text-[16px] text-blue-600',
  titleClassName = 'text-sm font-semibold text-slate-800',
  position = 'center', // 'center' | 'top'
  showBackdrop = true,
  closeOnBackdrop = true,
  disableClose = false,
  allowMinimize = true,
  allowFullscreen = true,
  normalPanelClassName = 'w-full max-w-lg rounded-2xl',
  fullscreenPanelClassName = 'w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] rounded-xl',
  panelClassName = '',
  bodyClassName = '',
  backdropClassName = 'bg-black/30 backdrop-blur-sm',
  zIndexClassName = 'z-50',
}) {
  const [mode, setMode] = useState('normal') // normal | minimized | fullscreen
  const [, setDockVersion] = useState(0)
  const windowIdRef = useRef(null)
  const minimized = mode === 'minimized'
  const fullscreen = mode === 'fullscreen'

  if (windowIdRef.current === null) {
    windowModalCounter += 1
    windowIdRef.current = `window-modal-${windowModalCounter}`
  }

  useEffect(() => {
    if (open) setMode('normal')
  }, [open])

  useEffect(() => {
    const onDockChange = () => setDockVersion(v => v + 1)
    dockSubscribers.add(onDockChange)
    return () => dockSubscribers.delete(onDockChange)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (disableClose) return
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, disableClose])

  useEffect(() => {
    if (!open || !minimized) {
      removeFromDock(windowIdRef.current)
      return
    }
    addToDock(windowIdRef.current)
    return () => removeFromDock(windowIdRef.current)
  }, [open, minimized])

  if (!open) return null

  const closeWindow = () => {
    if (disableClose) return
    onClose?.()
  }

  const dockIndex = minimized ? Math.max(0, minimizedDockIds.indexOf(windowIdRef.current)) : 0
  const dockWidth = 300
  const dockGap = 10

  return (
    <>
      {!minimized && showBackdrop && (
        <div
          className={`fixed inset-0 ${backdropClassName} ${zIndexClassName}`}
          onClick={() => {
            if (closeOnBackdrop) closeWindow()
          }}
        />
      )}

      <div
        className={`fixed inset-0 pointer-events-none ${zIndexClassName} ${
          minimized
            ? 'hidden'
            : fullscreen
              ? 'flex items-stretch justify-stretch p-2'
              : position === 'top'
                ? 'flex items-start justify-center pt-[12vh]'
                : 'flex items-center justify-center p-4'
        }`}
      >
        <div
          className={`pointer-events-auto bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col ${
            fullscreen ? fullscreenPanelClassName : normalPanelClassName
          } ${panelClassName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconWrapClassName}`}>
                <Icon name={iconName} className={iconClassName} />
              </span>
              <h2 className={`${titleClassName} truncate`}>{title}</h2>
            </div>
            <div className="flex items-center gap-1">
              {allowMinimize && (
                <button
                  type="button"
                  onClick={() => setMode('minimized')}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Minimize"
                >
                  <Icon name="minimize" className="text-[18px]" />
                </button>
              )}
              {allowFullscreen && (
                <button
                  type="button"
                  onClick={() => setMode(fullscreen ? 'normal' : 'fullscreen')}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  <Icon name={fullscreen ? 'close_fullscreen' : 'open_in_full'} className="text-[18px]" />
                </button>
              )}
              <button
                type="button"
                onClick={closeWindow}
                disabled={disableClose}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Close"
              >
                <Icon name="close" className="text-[18px]" />
              </button>
            </div>
          </div>

          <div className={`min-h-0 ${fullscreen ? 'flex-1' : ''} ${bodyClassName}`}>
            {children}
          </div>
        </div>
      </div>

      {minimized && (
        <div
          className={`fixed bottom-4 ${zIndexClassName}`}
          style={{ right: `${16 + dockIndex * (dockWidth + dockGap)}px` }}
        >
          <div className="w-[300px] bg-white border border-slate-200 shadow-xl rounded-xl px-3 py-2 flex items-center gap-2">
            <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${iconWrapClassName}`}>
              <Icon name={iconName} className={iconClassName} />
            </span>
            <p className="text-xs font-semibold text-slate-700 truncate flex-1">{title}</p>
            <button
              type="button"
              onClick={() => setMode('normal')}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Restore"
            >
              <Icon name="open_in_new" className="text-[16px]" />
            </button>
            <button
              type="button"
              onClick={() => setMode('fullscreen')}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Fullscreen"
            >
              <Icon name="open_in_full" className="text-[16px]" />
            </button>
            <button
              type="button"
              onClick={closeWindow}
              disabled={disableClose}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Close"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
