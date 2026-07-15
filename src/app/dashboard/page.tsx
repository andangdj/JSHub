"use client";
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { PowerOff, Play, Square, ExternalLink, Terminal, FolderOpen, FolderSearch, Hammer, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type ProjectInfo = { 
  name: string; 
  path: string; 
  framework: string; 
  port: number; 
  is_running: boolean; 
  scripts: string[];
};
type LogEntry = { time: string; line: string; type: string };
type LogPayload = { project: string; entry: LogEntry };
type StatusPayload = { project: string; status: { running: boolean; pid?: number; port?: number } };

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [isFetching, setIsFetching] = useState(true);
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [useWsl, setUseWsl] = useState(true);
  const [scriptMenuOpen, setScriptMenuOpen] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const getFrameworkIcon = (frameworkStr: string) => {
    const fw = frameworkStr.toLowerCase();
    if (fw.includes('next')) return <img src="/icons/nextjs.svg" alt="Next.js" className="w-3 h-3 mr-1.5" />;
    if (fw.includes('react')) return <img src="/icons/react.svg" alt="React" className="w-3 h-3 mr-1.5" />;
    if (fw.includes('vue')) return <img src="/icons/vue.svg" alt="Vue" className="w-3 h-3 mr-1.5" />;
    if (fw.includes('express')) return <img src="/icons/express.svg" alt="Express" className="w-3 h-3 mr-1.5" />;
    if (fw.includes('nest')) return <img src="/icons/nestjs.svg" alt="NestJS" className="w-3 h-3 mr-1.5" />;
    return <img src="/icons/nodejs.svg" alt="Node.js" className="w-3 h-3 mr-1.5" />;
  };

  const fetchFolder = async () => {
    try {
      const cfg: { projects_base: string; use_wsl: boolean } = await invoke('get_config');
      setCurrentFolder(cfg.projects_base);
      setUseWsl(cfg.use_wsl);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProjects = async (showLoading = false) => {
    if (showLoading) setIsFetching(true);
    try {
      const res: ProjectInfo[] = await invoke('scan_projects');
      setProjects(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchFolder();
    fetchProjects(true);
    const interval = setInterval(() => fetchProjects(false), 3000);

    const setupListeners = async () => {
      const unlistenStatus = await listen<StatusPayload>('project-status', (event) => {
        fetchProjects(false);
      });
      return unlistenStatus;
    };
    let unlistener: (() => void) | undefined;
    setupListeners().then(fn => unlistener = fn);

    return () => {
      clearInterval(interval);
      if (unlistener) unlistener();
    };
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    const setupLogListener = async () => {
      const unlisten = await listen<LogPayload>('project-log', (event) => {
        if (event.payload.project === activeProject) {
          setLogs(prev => {
            const projectLogs = prev[activeProject] || [];
            return { ...prev, [activeProject]: [...projectLogs, event.payload.entry] };
          });
        }
      });
      return unlisten;
    };
    let unlistener: (() => void) | undefined;
    setupLogListener().then(fn => unlistener = fn);
    return () => { if (unlistener) unlistener(); };
  }, [activeProject]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, activeProject]);

  const toggleProject = async (p: ProjectInfo, selectedScript?: string) => {
    try {
      if (p.is_running) {
        await invoke('stop_project', { name: p.name });
      } else {
        const runScript = selectedScript || p.scripts[0] || 'dev';
        await invoke('start_project', { name: p.name, path: p.path, port: p.port, script: runScript });
        setActiveProject(p.name);
      }
      fetchProjects();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartClick = (e: React.MouseEvent, p: ProjectInfo) => {
    e.stopPropagation();
    if (p.is_running) {
      toggleProject(p);
      return;
    }

    if (p.scripts && p.scripts.length > 1) {
      setScriptMenuOpen(scriptMenuOpen === p.name ? null : p.name);
    } else {
      toggleProject(p, p.scripts[0] || 'dev');
    }
  };

  const changeFolder = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        let finalPath = selected;
        if (useWsl) {
          let wslPath = selected.replace(/\\/g, '/');
          if (wslPath.match(/^[a-zA-Z]:/)) {
            wslPath = `/mnt/${wslPath.charAt(0).toLowerCase()}${wslPath.slice(2)}`;
          }
          const wslMatch = wslPath.match(/^\/\/(?:wsl\.localhost|wsl\$)\/[^\/]+(\/.*)$/i);
          if (wslMatch) {
            wslPath = wslMatch[1];
          }
          finalPath = wslPath;
        }
        await invoke('set_config', { projectsBase: finalPath, useWsl });
        fetchFolder();
        fetchProjects(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleWslToggle = async (checked: boolean) => {
    try {
      let convertedPath = currentFolder;

      if (!checked && currentFolder.startsWith('/mnt/')) {
        // WSL ON -> OFF: convert /mnt/d/foo -> D:\foo
        const driveLetter = currentFolder[5].toUpperCase();
        const rest = currentFolder.slice(7).replace(/\//g, '\\');
        convertedPath = `${driveLetter}:\\${rest}`;
      } else if (checked && currentFolder.match(/^[a-zA-Z]:\\/)) {
        // WSL OFF -> ON: convert D:\foo -> /mnt/d/foo
        const driveLetter = currentFolder[0].toLowerCase();
        const rest = currentFolder.slice(3).replace(/\\/g, '/');
        convertedPath = `/mnt/${driveLetter}/${rest}`;
      }

      await invoke('set_config', { projectsBase: convertedPath, useWsl: checked });
      setCurrentFolder(convertedPath);
      setUseWsl(checked);
      fetchProjects(true);
    } catch (e) {
      console.error(e);
    }
  };

  const shutdown = async () => {
    await invoke('stop_jshub');
    router.push('/');
  };

  const buildProject = async () => {
    if (activeProject && activeProjData) {
      setLogs(prev => ({...prev, [activeProject]: []}));
      try {
        await invoke('build_project', { name: activeProjData.name, path: activeProjData.path });
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Close script selector when clicking elsewhere
  useEffect(() => {
    const handleOutsideClick = () => setScriptMenuOpen(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const currentLogs = activeProject ? (logs[activeProject] || []) : [];
  const filteredLogs = currentLogs.filter(log => 
    log.line.toLowerCase().includes(logFilter.toLowerCase())
  );
  const activeProjData = projects.find(p => p.name === activeProject);

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-300 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col">
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-emerald-400">JSHub</h2>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => handleWslToggle(!useWsl)}
              className={`px-2 py-1 text-[10px] rounded border font-semibold tracking-wider transition-all duration-300 ${
                useWsl 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' 
                  : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700 hover:text-white'
              }`}
              title={useWsl ? "Using WSL environment" : "Using native Windows environment"}
            >
              WSL: {useWsl ? "ON" : "OFF"}
            </button>
            <button 
              onClick={changeFolder}
              title="Change Projects Folder"
              className="p-2 bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white rounded-lg transition-colors"
            >
              <FolderSearch size={18} />
            </button>
            <button 
              onClick={shutdown}
              title="Shutdown JSHub & All Services"
              className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors"
            >
              <PowerOff size={18} />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* Active Folder Path Pill */}
          {currentFolder && (
            <div className="mb-3 px-3 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center gap-2 text-[11px] text-emerald-400/90 font-mono">
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500/70 animate-pulse"></span>
              <span className="truncate" title={currentFolder}>{currentFolder}</span>
            </div>
          )}

          {isFetching ? (
            <div className="flex flex-col items-center justify-center py-10 text-neutral-500">
              <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
              <p className="text-sm animate-pulse">Scanning projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center text-neutral-500 py-10 text-sm">
              <FolderOpen className="mx-auto mb-2 opacity-50" size={32} />
              No projects found
            </div>
          ) : projects.map(p => (
            <div 
              key={p.name}
              onClick={() => setActiveProject(p.name)}
              className={`p-3 rounded-xl cursor-pointer border transition-all duration-300 relative ${activeProject === p.name ? 'bg-neutral-800 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-white truncate pr-2">{p.name}</span>
                <span className={`w-2 h-2 rounded-full ${p.is_running ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'}`}></span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex flex-col gap-1.5 mt-1">
                  <span className="text-neutral-500">Port: {p.port}</span>
                  <span className="flex items-center text-[10.5px] font-medium text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-sm w-fit border border-indigo-500/20">
                    {getFrameworkIcon(p.framework)}
                    {p.framework}
                  </span>
                </div>
                
                <div className="relative">
                  <button
                    onClick={(e) => handleStartClick(e, p)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors font-medium
                      ${p.is_running 
                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
                  >
                    {p.is_running ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                    {p.is_running ? 'Stop' : 'Start'}
                  </button>

                  {/* Scripts dropdown menu */}
                  {scriptMenuOpen === p.name && !p.is_running && (
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-full mt-1 w-44 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden"
                    >
                      <div className="py-1.5 text-[10px] text-neutral-400 border-b border-neutral-700 px-2.5 font-bold uppercase tracking-wider">
                        Select Script
                      </div>
                      <div className="max-h-36 overflow-y-auto">
                        {p.scripts.map((script) => (
                          <button
                            key={script}
                            onClick={(e) => {
                              e.stopPropagation();
                              setScriptMenuOpen(null);
                              toggleProject(p, script);
                            }}
                            className="w-full text-left px-3 py-2 text-white hover:bg-emerald-500/20 hover:text-emerald-400 transition-colors truncate text-xs font-mono"
                          >
                            npm run {script}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content (Logs) */}
      <div className="flex-1 flex flex-col bg-[#0A0A0A]">
        {activeProject ? (
          <>
            <div className="h-16 border-b border-neutral-800 flex items-center justify-between px-6 bg-neutral-900/30">
              <div className="flex items-center gap-3">
                <Terminal className="text-emerald-500" size={20} />
                <h3 className="font-medium text-white">{activeProject}</h3>
                {activeProjData?.is_running && (
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-400">Live</span>
                )}
              </div>

              {/* Log filter search bar */}
              <div className="flex-1 max-w-xs mx-6 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="w-full bg-neutral-900/60 hover:bg-neutral-900 focus:bg-neutral-900 border border-neutral-800 focus:border-neutral-700 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder-neutral-500 outline-none transition-all duration-300"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={buildProject}
                  disabled={activeProjData?.is_running}
                  className={`flex items-center gap-2 px-4 py-1.5 text-sm rounded-lg transition-colors border ${
                    activeProjData?.is_running 
                    ? 'bg-neutral-900 border-neutral-800 text-neutral-600 cursor-not-allowed' 
                    : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/20 hover:border-indigo-500/50'
                  }`}
                  title="Build Project"
                >
                  <Hammer size={14} />
                  Build
                </button>
                {activeProjData?.is_running && (
                  <button 
                    onClick={() => openUrl(`http://localhost:${activeProjData.port}`)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-sm text-white rounded-lg transition-colors border border-neutral-700"
                  >
                    <ExternalLink size={14} />
                    Open Browser
                  </button>
                )}
                <button 
                  onClick={() => setLogs(prev => ({...prev, [activeProject]: []}))}
                  className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-sm rounded-lg transition-colors border border-neutral-800 text-neutral-400"
                >
                  Clear Logs
                </button>
              </div>
            </div>
            
            <div 
              className="flex-1 overflow-y-auto p-4 text-xs leading-tight" 
              style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace" }}
            >
              <AnimatePresence>
                {filteredLogs.map((log, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i} 
                    className="flex gap-3 hover:bg-white/[0.02] px-2 py-0.5 -mx-2 rounded"
                  >
                    <span className="text-neutral-600 shrink-0">{log.time.split('T')[1].substring(0,8)}</span>
                    <span className={`
                      ${log.type === 'stderr' || log.line.toLowerCase().includes('error') ? 'text-red-400' : ''}
                      ${log.type === 'system' ? 'text-emerald-400 font-semibold' : ''}
                      ${log.type === 'stdout' && !log.line.toLowerCase().includes('error') ? 'text-neutral-300' : ''}
                      whitespace-pre-wrap break-all
                    `}>
                      {log.line}
                    </span>
                  </motion.div>
                ))}
                <div ref={logsEndRef} />
              </AnimatePresence>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
            <Terminal size={48} className="mb-4 opacity-20" />
            <p>Select a project to view its terminal output</p>
          </div>
        )}
      </div>
    </div>
  );
}
