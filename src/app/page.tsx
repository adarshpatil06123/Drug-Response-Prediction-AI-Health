import PredictorForm from "@/components/PredictorForm";

export default function Home() {
  return (
    <div>
      <header className="header">
        <div className="header-container">
          <div className="logo-container">
            <div className="logo-icon">
              H
            </div>
            <h1 className="logo-text">HealthAI</h1>
          </div>
          <div className="notification-icon">
            <span className="material-symbols-outlined">notifications</span>
          </div>
        </div>
      </header>
      <main className="main-container">
        <PredictorForm />
      </main>
    </div>
  );
}