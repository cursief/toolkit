export default class ToggleElement
{
  constructor(button, target, toggleClass)
  {
    this.toggleButtons = document.querySelectorAll(button);
    this.toggleTarget = document.querySelector(target);
    this.toggleClass = toggleClass;
    this.isActive = false;

    this.bindEvents();
  }

  bindEvents() {
    this.toggleButtons.forEach((button) => {
      button.addEventListener('click', this.toggleEvent.bind(this));
    })
  }

  toggleEvent() {
    this.isActive = !this.isActive;
    event.currentTarget.classList.toggle('is-active');
    this.toggleTarget.classList.toggle(this.toggleClass);
    event.currentTarget.setAttribute('aria-checked', this.isActive ? 'true' : 'false')
  }
}
