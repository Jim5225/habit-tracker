export async function renderAnalyticsView(container) {
  container.innerHTML = `
    <div class="view-container">
      <h1>Analytics & Statistics</h1>
      <p class="subtitle">Overall tracker stats</p>
      
      <div class="card" style="text-align:center; padding: 40px;">
        <h2>Check back later!</h2>
        <p style="color:var(--text-secondary)">Once you have logged a few weeks of data, this page will unlock detailed success rates, streak analysis, and failure patterns.</p>
      </div>
    </div>
  `;
}
