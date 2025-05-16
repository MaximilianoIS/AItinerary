import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { auth } from '/static/firebase-config.js'
      
        
      
        let selectedDietary = [];
        let selectedInterests = [];
      
        onAuthStateChanged(auth, (user) => {
          if (user) {
            console.log("Logged in as:", user.displayName);
          } else {
            console.log("Not signed in");
            window.location.href = "/login";
          }
        });
      
        window.toggleDietary = function(diet) {
          const card = document.querySelector(`#dietary-cards .preference-card label[for="${diet}"]`).parentNode;
          const index = selectedDietary.indexOf(diet);
          if (index === -1) {
            selectedDietary.push(diet);
            card.classList.add('selected');
          } else {
            selectedDietary.splice(index, 1);
            card.classList.remove('selected');
          }
          console.log('Selected Dietary:', selectedDietary);
        };
      
        window.toggleInterest = function(interest) {
          const card = document.querySelector(`#interest-cards .preference-card label[for="${interest}"]`).parentNode;
          const index = selectedInterests.indexOf(interest);
          if (index === -1) {
            selectedInterests.push(interest);
            card.classList.add('selected');
          } else {
            selectedInterests.splice(index, 1);
            card.classList.remove('selected');
          }
          console.log('Selected Interests:', selectedInterests);
        };
      
        window.submitPreferences = function() {
          const allergies = document.getElementById('allergies').value.trim();
          const user = auth.currentUser;
          const username = user ? user.displayName : null;
      
          const preferencesData = {
            username,
            dietary: selectedDietary,
            allergies,
            interests: selectedInterests
          };
      
          fetch('/preference', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(preferencesData),
          })
          .then(async response => {
            const data = await response.json();
            if (response.ok) {
              console.log('Preferences saved successfully!', data);
              window.location.href = '/dashboard';
            } else {
              console.error('Failed to save preferences:', data.error);
              document.getElementById('error-message').textContent = data.error || 'Failed to save preferences. Please try again.';
            }
          })
          .catch(error => {
            console.error('Error saving preferences:', error);
            document.getElementById('error-message').textContent = 'An unexpected error occurred. Please try again later.';
          });
        };