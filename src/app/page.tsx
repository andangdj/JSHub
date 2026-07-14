"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { Power } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Splash() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    getVersion().then(v => setAppVersion(v)).catch(() => setAppVersion('0.1.0'));
  }, []);

  const startHub = async () => {
    setStarting(true);
    
    try {
      setStatusMsg('Checking for updates...');
      const update = await check();
      if (update) {
        setStatusMsg(`Downloading v${update.version}...`);
        await update.downloadAndInstall((event) => {
          if (event.event === 'Progress') {
            setStatusMsg(`Downloading... ${event.data.chunkLength} bytes`);
          }
        });
        setStatusMsg('Restarting app...');
        await relaunch();
        return;
      }
    } catch (e) {
      console.log('Update check skipped or failed:', e);
    }

    setStatusMsg('Starting services...');
    // Simulate boot up
    setTimeout(() => {
      router.push('/dashboard');
    }, 1500);
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
          <p className="text-neutral-400 text-lg"></p>
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

        <div className="h-8">
          {starting && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-emerald-400 text-sm animate-pulse font-medium"
            >
              {statusMsg}
            </motion.p>
          )}
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
