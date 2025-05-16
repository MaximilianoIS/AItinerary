document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startBtn");
  const welcome = document.getElementById("welcome");

  if (startBtn && welcome) {
    startBtn.addEventListener("click", (e) => {
      e.preventDefault();
      welcome.classList.add("fade-out");

      setTimeout(() => {
        window.location.href = startBtn.href;
      }, 2000); // now waits 2 seconds
    });
  }
});
