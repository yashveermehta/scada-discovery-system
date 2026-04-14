<div align="center">

# 🛡️ SecureTopo
### SCADA Network Topology Discovery & Security Monitoring Platform

<br/>

![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.x-FFD43B?style=for-the-badge&logo=python&logoColor=black)
![Flask](https://img.shields.io/badge/Flask-3-000000?style=for-the-badge&logo=flask&logoColor=white)
![D3.js](https://img.shields.io/badge/D3.js-7-F9A03C?style=for-the-badge&logo=d3.js&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)

**Live Demo:** [https://yashveermehta.github.io/scada-discovery-system/](https://yashveermehta.github.io/scada-discovery-system/)

<br/>

**Real-time SCADA network discovery, topology visualization, and rogue device detection.**

SecureTopo provides interactive network mapping and monitoring capabilities for industrial control system environments.

</div>

---

# 📌 Overview

SecureTopo is a **network discovery and monitoring platform** designed for SCADA and industrial control system environments.

The platform automatically discovers devices, maps the network topology, and visualizes connections between infrastructure components. It also helps detect **unauthorized or rogue devices** that appear within the network.

The system combines automated discovery with real-time visualization to give operators and security teams a clear view of the network infrastructure.

Key capabilities include:

- Automated network discovery
- Interactive topology visualization
- Rogue device detection
- Intrusion simulation for testing
- Security analytics dashboard

---

# ✨ Features

| Feature | Description |
|------|-------------|
| 🔍 **Automated Discovery** | Discovers network devices using SNMP polling and routing neighbor analysis |
| 🗺️ **Interactive Topology Map** | Real-time network visualization using D3.js |
| 🚨 **Rogue Device Detection** | Detects unauthorized devices appearing on the network |
| 🎯 **Intrusion Simulation** | Simulate rogue devices for testing and training |
| 📊 **Security Dashboard** | Displays network metrics, device health, and alerts |
| 🔐 **Device Authorization** | Whitelist-based device approval system |
| 🌙 **NOC-Friendly Interface** | Dark UI optimized for network operations environments |
| ⚡ **Demo Mode** | Runs entirely with simulated network data |

---

# 🏗️ Technology Stack

### Frontend
- React 18
- TypeScript
- D3.js
- Tailwind CSS
- Vite

### Backend
- Python
- Flask
- Flask-CORS

### Network Discovery
- pysnmp-lextudio (SNMPv3)
- NetworkX

### Database
- SQLite

---

# 📁 Project Structure

```
scada-discovery-system/
│
├── frontend-react/               # React + TypeScript frontend
│   └── src/
│       ├── App.tsx               # Main application
│       ├── types.ts              # Type definitions
│       ├── components/
│       │   └── TopologyMap.tsx   # D3 topology visualization
│       └── services/
│           ├── apiService.ts
│           ├── networkSimulation.ts
│           └── geminiService.ts
│
├── frontend/                     # Legacy HTML/CSS/JS version
│
├── backend/
│   ├── api/
│   │   └── app.py                # Flask REST API
│   ├── core/
│   │   ├── config_loader.py
│   │   └── logger.py
│   ├── discovery/
│   │   ├── topology_discovery.py
│   │   └── snmp_client.py
│   ├── config/
│   │   └── config.yaml
│   └── database.py
│
├── tests/                        # Unit tests
├── docs/                         # Documentation assets
├── requirements.txt
├── setup.bat
└── run_app.bat
```

---

# 🚀 Quick Start

## Requirements

- Node.js (v18+)
- Python (3.9+)
- Git

---

# Run Demo Mode (Frontend Only)

Runs using simulated topology data.

```bash
git clone https://github.com/YOUR_USERNAME/scada-discovery-system.git

cd scada-discovery-system/frontend-react

npm install

npm run dev
```

Open the local development server shown in the terminal.

---

# Run Full Stack Version

### Backend

```bash
python -m venv venv

venv\Scripts\activate      # Windows
source venv/bin/activate   # Linux / Mac

pip install -r requirements.txt

cd backend/api
python app.py
```

### Frontend

```bash
cd frontend-react

npm install

npm run dev
```

---

# 🔌 API Endpoints

| Method | Endpoint | Description |
|------|-----------|-------------|
| GET | /api/info | Application status |
| GET | /api/topology | Retrieve network topology |
| POST | /api/discovery/start | Start network discovery |
| GET | /api/discovery/status | Discovery progress |
| POST | /api/devices/authorize | Authorize device |
| GET | /api/devices | List discovered devices |

---

# ⚙️ Configuration

Configuration file:

```
backend/config/config.yaml
```

Example:

```yaml
network:
  subnet: "192.168.1.0/24"
  snmp_community: "public"
  snmp_version: 3
  timeout: 5

app:
  name: "SecureTopo"
  version: "1.0.0"
  environment: "development"
```

---

# 🧪 Running Tests

```bash
python -m pytest tests/
```

---

# 📄 License

This project is released for educational and research purposes.

---

<div align="center">

Made with ❤️ by **Yashveer Mehta**

</div>