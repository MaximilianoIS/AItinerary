// static/dropdown-select.js

document.addEventListener('DOMContentLoaded', () => {
    const dropdown = document.querySelector('.custom-dropdown');
    const selectedOption = dropdown.querySelector('.selected-option');
    const items = dropdown.querySelectorAll('.dropdown-item');
  
    items.forEach(item => {
      item.addEventListener('click', (event) => {
        event.stopPropagation();  // prevent dropdown click from firing
        selectedOption.textContent = item.textContent.trim();
        dropdown.classList.remove('open');
      });
    });
  
    dropdown.addEventListener('click', (event) => {
      // Only toggle if not already closing due to inner click
      if (!event.target.closest('.dropdown-item')) {
        dropdown.classList.toggle('open');
      }
    });
  
    // Optional: close if you click anywhere outside the dropdown
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  });
  