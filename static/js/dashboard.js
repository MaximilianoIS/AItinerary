document.addEventListener("DOMContentLoaded", function () {
    document.querySelector("#generate-plan-button").addEventListener("click", function () {
      const userIdea = document.querySelector("#trip-input").value;
  
      fetch("/my_trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ idea: userIdea })
      })
      .then(res => res.json())
      .then(data => {
        document.querySelector("#result").textContent = data.error || data.result;
      });
    });
  });

  

