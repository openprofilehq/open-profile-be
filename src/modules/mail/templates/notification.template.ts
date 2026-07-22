export function renderNotificationEmail(title: string, body: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>${title}</h2>
      <p>${body}</p>
    </div>
  `;
}
