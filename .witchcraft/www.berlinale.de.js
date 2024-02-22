document.addEventListener('DOMContentLoaded', () => {

  // Hide screenings without tickets
  document.querySelectorAll('section.film-entry section.screening').forEach((section) => {
    Array.from(section.querySelectorAll('div.row'))
      .every(row => row.querySelector('a.ticket--active') === null) && (section.style.display = 'none')
  });

  // Hide films without tickets
  document.querySelectorAll('section.film-entry').forEach((filmEntry) => {
    Array.from(filmEntry.querySelectorAll('section.screening div.row'))
      .every(row => row.querySelector('a.ticket--active') === null) && (filmEntry.style.display = 'none')
  });

});

