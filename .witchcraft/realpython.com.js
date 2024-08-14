// Remove annoying modal from realpython.com
document.addEventListener('DOMContentLoaded', (e) => {
  let body = document.querySelector('body');
  setInterval(() => {
    document.querySelectorAll('.modal.fade.show, .modal-backdrop').forEach((e) => e.remove());
    body.className = body.className.replace('modal-open', '');
  }, 100);
});

