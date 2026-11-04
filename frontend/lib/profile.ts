// Single source of truth for the "Credentials" section. Edit here, nothing else needs to change.
export const profile = {
  name: "Nikhil Chary Sriramoju",
  role: "Aspiring Software Engineer · AI/ML & Data Analytics",
  location: "Warangal, Telangana, India",
  email: "sriramojunikhil66@gmail.com",
  github: "https://github.com/Nikhil-creat",
  linkedin: "https://in.linkedin.com/in/nikhil-chary-sriramoju-95041b38a",
  openTo: ["AI / ML", "Software engineering", "Cloud & CI/CD", "Data analytics"],
  education: {
    degree: "B.Tech, Computer Science & Engineering",
    school: "Vaagdevi College of Engineering",
    years: "2023 – 2027",
  },
  stats: [
    { label: "Certificates completed", value: 100, suffix: "+" },
    { label: "Internships & micro-internships", value: 5, suffix: "+" },
    { label: "Projects shipped", value: 10, suffix: "+" },
    { label: "Credentials logged on portfolio", value: 33, suffix: "" },
  ],
  skills: {
    "AI / ML": ["Deep Learning (CNN)", "Grad-CAM", "RAG", "Agentic AI", "LangGraph", "scikit-learn"],
    "Data": ["Python (pandas)", "SQL", "Power BI", "Excel"],
    "Backend": ["FastAPI", "Django", "Node / Socket.io", "MongoDB", "MySQL"],
    "Frontend & Ops": ["React", "Next.js", "Tailwind", "Docker", "Git / GitHub"],
  } as Record<string, string[]>,
  experience: [
    { title: "Data Analytics Intern", org: "Thiranex", when: "Jul – Aug 2026", note: "Micro-internship with weekly platform tasks." },
    { title: "Machine Learning Engineer Intern", org: "Yuva Intern · NSDC", when: "6-week programme", note: "Weekly submitted tasks, starting with an ML-pipeline project plan." },
    { title: "Cyber Security Global Virtual Internship", org: "Clifford Chance · Forage", when: "Jul 2026", note: "Virtual job simulation." },
    { title: "Data & Technology Transactions Simulation", org: "Latham & Watkins · Forage", when: "Jul 2026", note: "Virtual job simulation." },
    { title: "Software Development Simulation", org: "Datacom · Forage", when: "Jul 2026", note: "Virtual job simulation." },
  ],
  issuers: [
    "Skill India / NASSCOM", "IBM SkillsBuild", "UiPath", "Reliance Foundation", "Forage",
    "Deloitte", "TATA", "BCG Platinion", "Skyscanner", "Vista", "AIG", "EAB", "LifeArc",
    "British Airways", "Morrison Foerster", "Ashurst Perkins Coie", "Latham & Watkins", "Datacom", "Clifford Chance",
  ],
  tracks: [
    "Cloud & Cybersecurity", "Data / AI & Emerging Tech", "Automation & Robotics",
    "Software & Systems Engineering", "Consulting & Business Simulations",
  ],
  projects: [
    { name: "NeuroScan AI", tag: "Deep Learning · RAG", desc: "Explainable CNN + Grad-CAM + RAG clinical decision support for multi-class brain MRI (tumor / Alzheimer's / normal). Final-year mini project." },
    { name: "AgentShield-X", tag: "AI Security", desc: "Zero-trust security & governance layer for LLM / RAG / multi-agent systems — guardrails, sandbox, Merkle audit ledger." },
    { name: "Omni-Cloud Sentinel", tag: "Multi-agent · Cloud Ops", desc: "FinOps, DevSecOps, incident copilot, CI/CD gate and self-healing Kubernetes behind one agentic console." },
    { name: "TrustGuard AI", tag: "Fraud · MLOps", desc: "Document / KYC verification, real-time fraud detection, risk-case prioritisation and MLOps in one platform." },
    { name: "DistWorkspace", tag: "Distributed Systems", desc: "Real-time collaborative workspace: CRDT editing, Raft-based KV store and Kafka-style event streaming." },
    { name: "ChurnScope", tag: "Machine Learning", desc: "End-to-end customer-churn prediction: data generator, scikit-learn pipeline, evaluation and serving." },
    { name: "AI PDF Chatbot", tag: "RAG", desc: "Upload PDFs and chat with them — embeddings, vector search, retrieval and prompt engineering." },
    { name: "NL2SQL Data Agent", tag: "Agentic AI", desc: "Chat with your data: natural language to SQL with automatic insights." },
    { name: "Task Manager", tag: "Full-stack", desc: "JWT auth, MongoDB and Socket.io real-time updates." },
  ],
};
