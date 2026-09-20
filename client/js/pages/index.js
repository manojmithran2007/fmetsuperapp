/**
 * Landing Page Logic (index.html)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusIndicator = document.getElementById('api-status-indicator');
  
  if (statusIndicator) {
    try {
      const health = await window.Api.getHealth();
      statusIndicator.innerHTML = `
        <span class="badge badge-success" style="font-size: 11px;">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:var(--color-success);margin-right:4px;"></span>
          System Online
        </span>
      `;
    } catch (err) {
      statusIndicator.innerHTML = `
        <span class="badge badge-warning" style="font-size: 11px;">
          Offline / Connecting
        </span>
      `;
    }
  }
});
