"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Power, RefreshCw, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Splash() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<any>(null);

  useEffect(() => {
    getVersion().then(v => {
      setAppVersion(v);
      getCurrentWindow().setTitle(`JSHub - v${v}`).catch(console.error);
    }).catch((err) => {
      console.error(err);
      setAppVersion('');
    });
  }, []);

  const checkAndUpdate = async () => {
    setUpdateError('');
    setStatusMsg('Checking for updates...');

    try {
      const update = await check();
      if (update) {
        setPendingUpdate(update);
        setShowUpdateDialog(true);
        setStatusMsg('Update available');
        return;
      }
      // No update available, proceed to dashboard
      goToDashboard();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('Update check failed:', errMsg);
      setUpdateError(errMsg);
    }
  };

  const runUpdate = async () => {
    if (!pendingUpdate) return;
    setShowUpdateDialog(false);
    setStatusMsg(`Downloading v${pendingUpdate.version}...`);
    try {
      let totalDownloaded = 0;
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === 'Progress') {
          totalDownloaded += event.data.chunkLength;
          const mb = (totalDownloaded / 1024 / 1024).toFixed(1);
          setStatusMsg(`Downloading v${pendingUpdate.version}... ${mb} MB`);
        }
      });
      setStatusMsg('Restarting app...');
      await relaunch();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('Update failed:', errMsg);
      setUpdateError(errMsg);
    }
  };

  const goToDashboard = () => {
    setShowUpdateDialog(false);
    setUpdateError('');
    setStatusMsg('Starting services...');
    setTimeout(() => {
      router.push('/dashboard');
    }, 1500);
  };

  const startHub = async () => {
    setStarting(true);
    await checkAndUpdate();
  };

  const retryUpdate = async () => {
    setUpdateError('');
    await checkAndUpdate();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-white font-sans">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-emerald-500/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-blue-500/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 flex flex-col items-center gap-6"
      >
        <div className="text-center flex flex-col items-center gap-4">
          <motion.img 
            src="/app-icon.png" 
            alt="JSHub Icon" 
            className="w-16 h-16 rounded-2xl shadow-[0_0_50px_rgba(247,223,30,0.15)]"
            initial={{ rotate: -10, scale: 0.9 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ duration: 0.5, type: "spring" }}
          />
          <h1 className="text-6xl font-extrabold tracking-tight">
            <span className="text-[#ead114]">JS</span>
            <span className="text-[#1dd25f]">Hub</span>
          </h1>
        </div>

        <button
          onClick={startHub}
          disabled={starting}
          className={`relative group flex items-center justify-center w-32 h-32 rounded-full transition-all duration-500
            ${starting 
              ? 'bg-emerald-500/20 shadow-[0_0_60px_rgba(16,185,129,0.4)] border-emerald-500/50' 
              : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 hover:border-emerald-500/50 hover:shadow-[0_0_40px_rgba(16,185,129,0.2)]'
            } border-2`}
        >
          <Power 
            size={48} 
            className={`transition-all duration-500 ${starting ? 'text-emerald-400 animate-pulse' : 'text-neutral-500 group-hover:text-emerald-400'}`} 
          />
        </button>

        <div className="min-h-[80px] flex flex-col items-center gap-3">
          {starting && !updateError && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-emerald-400 text-sm animate-pulse font-medium"
            >
              {statusMsg}
            </motion.p>
          )}

          <AnimatePresence>
            {updateError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center gap-3 max-w-md"
              >
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-center">
                  <p className="text-red-400 text-xs font-medium mb-1">Update failed</p>
                  <p className="text-red-300/70 text-xs font-mono break-all">{updateError}</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={retryUpdate}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 rounded-lg text-emerald-400 text-sm font-medium transition-all duration-300"
                  >
                    <RefreshCw size={14} />
                    Coba Lagi
                  </button>
                  <button
                    onClick={goToDashboard}
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-neutral-300 text-sm font-medium transition-all duration-300"
                  >
                    Lanjut
                    <ArrowRight size={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {showUpdateDialog && pendingUpdate && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-6"
            >
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-white">Pembaruan Tersedia!</h3>
                <p className="text-neutral-400 text-sm">Versi baru JSHub siap untuk diunduh.</p>
              </div>

              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex justify-around items-center text-sm font-mono">
                <div className="text-center">
                  <div className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider mb-1">Terinstall</div>
                  <div className="text-neutral-300 font-semibold">v{appVersion}</div>
                </div>
                <div className="text-neutral-600">→</div>
                <div className="text-center">
                  <div className="text-emerald-500 text-[10px] uppercase font-bold tracking-wider mb-1">Versi Baru</div>
                  <div className="text-emerald-400 font-bold">v{pendingUpdate.version}</div>
                </div>
              </div>

              {pendingUpdate.notes && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 max-h-24 overflow-y-auto text-xs text-neutral-400 leading-relaxed font-sans">
                  <div className="font-semibold text-neutral-300 mb-1">Catatan Rilis:</div>
                  {pendingUpdate.notes}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={runUpdate}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-emerald-500/10"
                >
                  Perbarui Sekarang
                </button>
                <button
                  onClick={goToDashboard}
                  className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-300 text-sm font-medium rounded-xl border border-neutral-700 transition-colors"
                >
                  Lanjut ke Dashboard
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {appVersion && (
        <div className="absolute bottom-4 right-6 text-neutral-600 text-xs font-medium font-mono">
          v{appVersion}
        </div>
      )}
    </div>
  );
}
