"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { Power, RefreshCw, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Splash() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [updateError, setUpdateError] = useState('');

  useEffect(() => {
    getVersion().then(v => setAppVersion(v)).catch(() => setAppVersion('0.1.0'));
  }, []);

  const checkAndUpdate = async () => {
    setUpdateError('');
    setStatusMsg('Checking for updates...');

    try {
      const update = await check();
      if (update) {
        setStatusMsg(`Downloading v${update.version}...`);
        let totalDownloaded = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === 'Progress') {
            totalDownloaded += event.data.chunkLength;
            const mb = (totalDownloaded / 1024 / 1024).toFixed(1);
            setStatusMsg(`Downloading v${update.version}... ${mb} MB`);
          }
        });
        setStatusMsg('Restarting app...');
        await relaunch();
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

  const goToDashboard = () => {
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
        className="z-10 flex flex-col items-center gap-8"
      >
        <div className="text-center space-y-2">
          <h1 className="text-6xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            JSHub
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
      
      {appVersion && (
        <div className="absolute bottom-4 right-6 text-neutral-600 text-xs font-medium font-mono">
          v{appVersion}
        </div>
      )}
    </div>
  );
}
