use std::sync::Mutex;
use std::process::{Command, Stdio};
use std::io::{BufReader, BufRead};
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::{AppHandle, Emitter, State, Manager};
use serde::{Deserialize, Serialize};

#[derive(Default)]
struct AppState {
    processes: Mutex<std::collections::HashMap<String, u32>>,
    config_path: String,
}

#[derive(Serialize, Deserialize)]
struct Config {
    projects_base: String,
    use_wsl: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct LogEntry {
    time: String,
    line: String,
    #[serde(rename = "type")]
    log_type: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ProjectStatus {
    running: bool,
    pid: Option<u32>,
    port: Option<u16>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ProjectInfo {
    name: String,
    path: String,
    framework: String,
    port: u16,
    is_running: bool,
    scripts: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct LogPayload {
    project: String,
    entry: LogEntry,
}

#[derive(Serialize, Deserialize, Clone)]
struct StatusPayload {
    project: String,
    status: ProjectStatus,
}

fn get_config_file(app: &AppHandle) -> String {
    let mut path = app.path().app_data_dir().unwrap();
    fs::create_dir_all(&path).ok();
    path.push("config.json");
    path.to_string_lossy().to_string()
}

#[tauri::command]
fn get_config(_state: State<AppState>, app: AppHandle) -> Config {
    let path = get_config_file(&app);
    let mut cfg = if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(c) = serde_json::from_str(&content) {
            c
        } else {
            Config { 
                projects_base: "/home/sol013/KargoOke".into(),
                use_wsl: true,
            }
        }
    } else {
        Config { 
            projects_base: "/home/sol013/KargoOke".into(),
            use_wsl: true,
        }
    };

    #[cfg(not(target_os = "windows"))]
    {
        cfg.use_wsl = false;
        if cfg.projects_base.contains("/home/sol013") {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
            cfg.projects_base = home;
        }
    }
    cfg
}

#[tauri::command]
fn set_config(projects_base: String, mut use_wsl: bool, app: AppHandle) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    {
        use_wsl = false;
    }
    let path = get_config_file(&app);
    let cfg = Config { projects_base, use_wsl };
    let json = serde_json::to_string(&cfg).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

fn find_node_path() -> String {
    #[cfg(target_os = "windows")]
    {
        "node".to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        // 1. Try standard command path
        if Command::new("node").arg("-v").output().is_ok() {
            return "node".to_string();
        }
        
        // 2. Try zsh first (default on macOS) by explicitly sourcing zshrc
        let output = Command::new("zsh")
            .arg("-c")
            .arg("source ~/.zprofile 2>/dev/null; source ~/.zshrc 2>/dev/null; which node")
            .output();
        if let Ok(out) = output {
            let path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path_str.is_empty() && path_str.contains('/') {
                return path_str;
            }
        }
        
        // Try bash
        let output = Command::new("bash")
            .arg("-c")
            .arg("source ~/.bash_profile 2>/dev/null; source ~/.bashrc 2>/dev/null; which node")
            .output();
        if let Ok(out) = output {
            let path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path_str.is_empty() && path_str.contains('/') {
                return path_str;
            }
        }

        // Try standard Homebrew path
        if std::path::Path::new("/opt/homebrew/bin/node").exists() {
            return "/opt/homebrew/bin/node".to_string();
        }
        
        // Try standard Intel path
        if std::path::Path::new("/usr/local/bin/node").exists() {
            return "/usr/local/bin/node".to_string();
        }
        
        "node".to_string()
    }
}

#[tauri::command]
async fn scan_projects(state: State<'_, AppState>, app: AppHandle) -> Result<Vec<ProjectInfo>, String> {
    let mut projects = Vec::new();
    let cfg = get_config(state.clone(), app.clone());
    
    // For now we just mock this or run wsl ls if it's a wsl path?
    // Wait, since we are on Windows, we can access WSL paths via \\wsl$\ or \\wsl.localhost\
    // But the user said: "Untuk development kita tetep pake wsl aja".
    // So the projects_base is typically a WSL path like `/home/sol013/KargoOke`.
    // We can run `wsl -e bash -c "ls -1 /home/sol013/KargoOke"`
    
    let js_script = r#"
const fs = require('fs');
const path = require('path');
const base = process.argv[2];
if (!fs.existsSync(base)) process.exit(0);
let dirs = [];
try {
  dirs = fs.readdirSync(base).filter(d => {
    try {
      return fs.statSync(path.join(base, d)).isDirectory();
    } catch(e) {
      return false;
    }
  });
} catch(e) {
  process.exit(0);
}
let nextPort = 3001;
const out = [];
for (const dir of dirs) {
  try {
    const p = path.join(base, dir, 'package.json');
    if (fs.existsSync(p)) {
      let pkg = {};
      try { pkg = JSON.parse(fs.readFileSync(p)); } catch(e){}
      let port = null;
      const envs = ['.env.local', '.env', '.env.development'];
      for (const e of envs) {
        const ep = path.join(base, dir, e);
        if (fs.existsSync(ep)) {
          const m = fs.readFileSync(ep, 'utf8').match(/^PORT=(\d+)/m);
          if (m) { port = parseInt(m[1]); break; }
        }
      }
      const dev = pkg.scripts && pkg.scripts.dev ? pkg.scripts.dev : '';
      if (!port) {
        const cross = dev.match(/\bPORT=(\d+)/);
        if (cross) port = parseInt(cross[1]);
      }
      if (!port) {
        const flag = dev.match(/-p\s+(\d+)|--port[= ](\d+)/);
        if (flag) port = parseInt(flag[1] || flag[2]);
      }
      if (!port) {
        port = nextPort++;
      }
      
      let framework = 'Node.js';
      let version = '';
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.next) { framework = 'Next.js'; version = deps.next; }
      else if (deps['@nestjs/core']) { framework = 'NestJS'; version = deps['@nestjs/core']; }
      else if (deps.express) { framework = 'Express'; version = deps.express; }
      else if (deps.react) { framework = 'React'; version = deps.react; }
      else if (deps.vue) { framework = 'Vue'; version = deps.vue; }
      else if (deps.node) { version = deps.node; } // fallback
      
      if (version) version = version.replace(/^[~^]/, '');
      
      const scripts = Object.keys(pkg.scripts || {}).join(',');
      out.push(`${dir}|${pkg.name || dir}|${port}|${framework}|${version}|${scripts}`);
    }
  } catch(e){}
}
console.log(out.join('\n'));
"#;

    // Write the js_script to a temp file inside wsl to avoid quoting hell
    use std::io::Write;
    let temp_path = format!("{}/jshub_scan.js", std::env::temp_dir().to_string_lossy().replace("\\", "/"));
    if let Ok(mut file) = fs::File::create(&temp_path) {
        let _ = file.write_all(js_script.as_bytes());
    }

    let output = if cfg.use_wsl {
        let bash_cmd = format!(
            "export NVM_DIR=\"$HOME/.nvm\"; [ -s \"$NVM_DIR/nvm.sh\" ] && \\. \"$NVM_DIR/nvm.sh\"; node \"$(wslpath '{}')\" \"{}\"",
            temp_path, cfg.projects_base
        );
        let mut cmd = Command::new("wsl");
        cmd.arg("-e").arg("bash").arg("-c").arg(bash_cmd);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.output()
    } else {
        if cfg!(target_os = "windows") {
            let mut cmd = Command::new("node");
            cmd.arg(&temp_path).arg(&cfg.projects_base);
            #[cfg(target_os = "windows")]
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            cmd.output()
        } else {
            let node_path = find_node_path();
            let shell = if std::path::Path::new("/bin/zsh").exists() || std::path::Path::new("/usr/bin/zsh").exists() {
                "zsh"
            } else {
                "bash"
            };
            let mut cmd = Command::new(shell);
            let cmd_str = format!(
                "source ~/.{0}profile 2>/dev/null; source ~/.{0}rc 2>/dev/null; \"{1}\" \"{2}\" \"{3}\"",
                if shell == "zsh" { "z" } else { "bash_" },
                node_path, temp_path, cfg.projects_base
            );
            cmd.arg("-c").arg(cmd_str);
            cmd.output()
        }
    };
        
    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        let stderr = String::from_utf8_lossy(&out.stderr);
        println!("JSHub Scanner CMD run: use_wsl={}, temp_path={}, projects_base={}", cfg.use_wsl, temp_path, cfg.projects_base);
        println!("JSHub Scanner stdout: {}", stdout);
        if !stderr.is_empty() {
            println!("JSHub Scanner stderr: {}", stderr);
        }
        let running = state.processes.lock().unwrap();
        
        for line in stdout.lines() {
            if line.trim().is_empty() { continue; }
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() < 5 { continue; }
            let dir_name = parts[0];
            let name = parts[1];
            let port = parts[2].parse::<u16>().unwrap_or(3001);
            let framework = parts[3];
            let framework_version = parts[4];
            let scripts = if parts.len() >= 6 {
                parts[5].split(',').filter(|s| !s.is_empty()).map(String::from).collect()
            } else {
                Vec::new()
            };
            
            let proj_path = if cfg.use_wsl {
                format!("{}/{}", cfg.projects_base, dir_name)
            } else {
                let base = cfg.projects_base.trim_end_matches('\\');
                format!("{}\\{}", base, dir_name)
            };

            projects.push(ProjectInfo {
                name: dir_name.to_string(),
                path: proj_path,
                framework: format!("{} {}", framework, framework_version).trim().to_string(),
                port,
                is_running: running.contains_key(dir_name),
                scripts,
            });
        }
    }
    Ok(projects)
}

fn emit_log(app: &AppHandle, name: &str, line: &str, ltype: &str) {
    let entry = LogEntry {
        time: chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        line: line.to_string(),
        log_type: ltype.to_string(),
    };
    app.emit("project-log", LogPayload { project: name.to_string(), entry }).ok();
}

#[tauri::command]
async fn start_project(name: String, path: String, port: u16, script: String, state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    let mut procs = state.processes.lock().unwrap();
    if procs.contains_key(&name) {
        return Err("Already running".into());
    }
    
    let cfg = get_config(state.clone(), app.clone());
    let active_script = if script.is_empty() { "dev".to_string() } else { script };

    let mut cmd = if cfg.use_wsl {
        emit_log(&app, &name, &format!("🚀 Starting {} on port {} (script: npm run {}) in WSL...", name, port, active_script), "system");
        let bash_cmd = format!(
            "export NVM_DIR=\"$HOME/.nvm\"; [ -s \"$NVM_DIR/nvm.sh\" ] && \\. \"$NVM_DIR/nvm.sh\"; cd {} && PORT={} npm run {}",
            path, port, active_script
        );
        let mut c = Command::new("wsl");
        c.arg("-e").arg("bash").arg("-c").arg(bash_cmd);
        c
    } else {
        emit_log(&app, &name, &format!("🚀 Starting {} on port {} (script: npm run {}) natively...", name, port, active_script), "system");
        if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.arg("/c").arg(format!("npm run {}", active_script));
            c.current_dir(path.replace("/", "\\"));
            c.env("PORT", port.to_string());
            c
        } else {
            let shell = if std::path::Path::new("/bin/zsh").exists() || std::path::Path::new("/usr/bin/zsh").exists() {
                "zsh"
            } else {
                "bash"
            };
            let mut c = Command::new(shell);
            let cmd_str = format!(
                "source ~/.{0}profile 2>/dev/null; source ~/.{0}rc 2>/dev/null; npm run {1}",
                if shell == "zsh" { "z" } else { "bash_" },
                active_script
            );
            c.arg("-c").arg(cmd_str);
            c.current_dir(&path);
            c.env("PORT", port.to_string());
            c
        }
    };
    
    cmd.stdout(Stdio::piped())
       .stderr(Stdio::piped())
       .stdin(Stdio::null());
       
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
       
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        
    let pid = child.id();
    procs.insert(name.clone(), pid);
    
    app.emit("project-status", StatusPayload { project: name.clone(), status: ProjectStatus { running: true, pid: Some(pid), port: Some(port) } }).ok();
    
    // Spawn threads to read stdout/stderr
    let app_clone = app.clone();
    let name_clone = name.clone();
    let stdout = child.stdout.take().unwrap();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                emit_log(&app_clone, &name_clone, &l, "stdout");
            }
        }
    });
    
    let app_clone2 = app.clone();
    let name_clone2 = name.clone();
    let stderr = child.stderr.take().unwrap();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                emit_log(&app_clone2, &name_clone2, &l, "stderr");
            }
        }
    });
    
    // Wait for exit
    let app_clone3 = app.clone();
    let name_clone3 = name.clone();
    std::thread::spawn(move || {
        let _ = child.wait();
        emit_log(&app_clone3, &name_clone3, "Process exited", "system");
        app_clone3.emit("project-status", StatusPayload { project: name_clone3.clone(), status: ProjectStatus { running: false, pid: None, port: None } }).ok();
    });
    
    Ok(())
}

#[tauri::command]
async fn stop_project(name: String, state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    let mut procs = state.processes.lock().unwrap();
    if let Some(pid) = procs.remove(&name) {
        emit_log(&app, &name, "🛑 Stopping project...", "system");
        
        let cfg = get_config(state.clone(), app.clone());
        let mut cmd = if cfg.use_wsl {
            let mut c = Command::new("wsl");
            c.arg("-e").arg("bash").arg("-c").arg(format!("pkill -f 'npm run'"));
            c
        } else {
            if cfg!(target_os = "windows") {
                let mut c = Command::new("taskkill");
                c.args(&["/F", "/T", "/PID", &pid.to_string()]);
                c
            } else {
                let mut c = Command::new("sh");
                c.arg("-c").arg(format!("pkill -P {0} ; kill -9 {0}", pid));
                c
            }
        };
        
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000);
            
        let _ = cmd.output();
            
        app.emit("project-status", StatusPayload { project: name.clone(), status: ProjectStatus { running: false, pid: None, port: None } }).ok();
        Ok(())
    } else {
        Err("Not running".into())
    }
}

#[tauri::command]
async fn build_project(name: String, path: String, state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    emit_log(&app, &name, "🔨 Starting build process...", "system");
    
    let cfg = get_config(state.clone(), app.clone());
    let mut cmd = if cfg.use_wsl {
        let bash_cmd = format!(
            "export NVM_DIR=\"$HOME/.nvm\"; [ -s \"$NVM_DIR/nvm.sh\" ] && \\. \"$NVM_DIR/nvm.sh\"; cd {} && npm run build",
            path
        );
        let mut c = Command::new("wsl");
        c.arg("-e").arg("bash").arg("-c").arg(bash_cmd);
        c
    } else {
        if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.arg("/c").arg("npm run build");
            c.current_dir(path.replace("/", "\\"));
            c
        } else {
            let shell = if std::path::Path::new("/bin/zsh").exists() || std::path::Path::new("/usr/bin/zsh").exists() {
                "zsh"
            } else {
                "bash"
            };
            let mut c = Command::new(shell);
            let cmd_str = format!(
                "source ~/.{0}profile 2>/dev/null; source ~/.{0}rc 2>/dev/null; npm run build",
                if shell == "zsh" { "z" } else { "bash_" }
            );
            c.arg("-c").arg(cmd_str);
            c.current_dir(&path);
            c
        }
    };
    
    cmd.stdout(Stdio::piped())
       .stderr(Stdio::piped())
       .stdin(Stdio::null());
       
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
       
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        
    let app_clone = app.clone();
    let name_clone = name.clone();
    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    emit_log(&app_clone, &name_clone, &l, "stdout");
                }
            }
        });
    }
    
    let app_clone2 = app.clone();
    let name_clone2 = name.clone();
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    emit_log(&app_clone2, &name_clone2, &l, "stderr");
                }
            }
        });
    }
    
    let app_clone3 = app.clone();
    let name_clone3 = name;
    std::thread::spawn(move || {
        let status = child.wait().unwrap();
        if status.success() {
            emit_log(&app_clone3, &name_clone3, "✅ Build completed successfully!", "system");
        } else {
            emit_log(&app_clone3, &name_clone3, "❌ Build failed.", "system");
        }
    });
    
    Ok(())
}

#[tauri::command]
async fn stop_jshub(state: State<'_, AppState>) -> Result<(), String> {
    // Kill all running local processes
    let mut procs = state.processes.lock().unwrap();
    for (_name, pid) in procs.iter() {
        if cfg!(target_os = "windows") {
            let mut cmd = Command::new("taskkill");
            cmd.args(&["/F", "/T", "/PID", &pid.to_string()]);
            #[cfg(target_os = "windows")]
            cmd.creation_flags(0x08000000);
            let _ = cmd.output();
        } else {
            let mut cmd = Command::new("sh");
            cmd.arg("-c").arg(format!("pkill -P {0} ; kill -9 {0}", pid));
            let _ = cmd.output();
        }
    }
    procs.clear();
    
    // Force kill node natively
    if cfg!(target_os = "windows") {
        let mut win_cmd = Command::new("taskkill");
        win_cmd.args(&["/F", "/IM", "node.exe"]);
        #[cfg(target_os = "windows")]
        win_cmd.creation_flags(0x08000000);
        let _ = win_cmd.output();
    } else {
        let mut unix_cmd = Command::new("pkill");
        unix_cmd.arg("-f").arg("node");
        let _ = unix_cmd.output();
    }
    
    // Force kill node in wsl (only if Windows)
    if cfg!(target_os = "windows") {
        let mut wsl_cmd = Command::new("wsl");
        wsl_cmd.arg("-e").arg("bash").arg("-c").arg("pkill -f node");
        #[cfg(target_os = "windows")]
        wsl_cmd.creation_flags(0x08000000);
        let _ = wsl_cmd.output();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            scan_projects,
            start_project,
            stop_project,
            build_project,
            stop_jshub,
            is_windows
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
