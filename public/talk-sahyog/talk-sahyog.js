(function () {
  const config = {
    main: ['Find a Caretaker', 'Care Services', 'How Sahyog Works', 'Charges', 'Safety & Process', 'Callback', 'Talk to the Sahyog Team'],
    services: ['Elderly Care', 'Patient Care', 'Bedridden Care', 'Post-Hospital / Recovery Care', 'Day Care', '24-Hour Care', 'Live-in Care', 'Short-Term Care', 'Long-Term Care']
  };
  const state = { service: '' };
  const root = document.getElementById('sahyogChat');
  if (!root) return;
  const messages = root.querySelector('[data-chat-messages]');
  const replies = root.querySelector('[data-chat-replies]');
  const input = root.querySelector('[data-chat-input]');
  function say(text, user) { const el = document.createElement('div'); el.className = 'chat-message chat-message--' + (user ? 'user' : 'bot'); el.textContent = text; messages.appendChild(el); messages.scrollTop = messages.scrollHeight; }
  function options(items) {
    replies.innerHTML = '';
    items.forEach((item) => {
      // A phone action must remain a native link so the device can open its dialer.
      if (item === 'Call Sahyog') {
        const callLink = document.createElement('a');
        callLink.className = 'chat-reply';
        callLink.href = 'tel:+917208027671';
        callLink.textContent = item;
        replies.appendChild(callLink);
        return;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chat-reply';
      button.textContent = item;
      button.addEventListener('click', () => choose(item));
      replies.appendChild(button);
    });
  }
  function main() { say('What would you like to know?'); options(config.main); }
  function openRequirement() { close(); if (typeof window.openModal === 'function') window.openModal(); else window.location.href = '../#care-guide'; }
  function openCallback() { close(); if (typeof window.openCallbackModal === 'function') window.openCallbackModal(); else window.location.href = '../#contact'; }
  function team() { say('You can call Sahyog directly at +91 72080 27671, request a callback, or submit a requirement.'); options(['Call Sahyog', 'Request a Callback', 'Submit Requirement', 'Main Menu']); }
  function service(name) { state.service = name; say(name + '\n\nSahyog can help families discuss caretaker support for this type of requirement. The exact support, timing and arrangement are discussed according to the family’s needs.'); options(['Request this service', 'Ask something else', 'Talk to Sahyog']); }
  function choose(choice) {
    say(choice, true);
    if (config.services.includes(choice)) return service(choice);
    if (choice === 'Find a Caretaker' || choice === 'Start requirement' || choice === 'Submit requirement' || choice === 'Request this service' || choice === 'Yes, find a caretaker') return openRequirement();
    if (choice === 'Care Services') { say('What kind of support are you looking for?'); return options(config.services); }
    if (choice === 'How Sahyog Works') { say('1. Share your requirement\n2. Sahyog team contacts you\n3. The team understands your care needs\n4. Suitable caretaker options are discussed\n5. Client confirms\n6. Care coordination begins\n7. Follow-up/support'); return options(['Yes, find a caretaker', 'Ask something else', 'Talk to Sahyog']); }
    if (choice === 'Charges') { say('Charges can depend on the care requirement, timing, duration and type of support. For exact charges related to your requirement, please discuss your needs with the Sahyog team.'); return options(['Submit requirement', 'Request a Callback', 'Talk to the Sahyog Team', 'Main Menu']); }
    if (choice === 'Safety & Process') { say('Sahyog first understands the family’s requirement. Relevant caretaker information and experience details can be discussed before the client confirms an arrangement. The exact process may depend on the requirement.'); return options(['Find a Caretaker', 'Talk to the Sahyog Team', 'Main Menu']); }
    if (choice === 'Callback' || choice === 'Request a Callback') { say('Not ready to submit a full requirement? You can request a callback from the Sahyog team.'); return options(['Open Callback Form', 'Main Menu']); }
    if (choice === 'Open Callback Form') return openCallback();
    if (choice === 'Talk to the Sahyog Team' || choice === 'Talk to Sahyog') return team();
    main();
  }
  function answer(text) { const q = text.toLowerCase(); if (/price|charge|cost/.test(q)) choose('Charges'); else if (/elderly|old person/.test(q)) choose('Elderly Care'); else if (/patient/.test(q)) choose('Patient Care'); else if (/callback|call me/.test(q)) choose('Callback'); else if (/contact|phone|team/.test(q)) choose('Talk to the Sahyog Team'); else { say('I’m currently able to help with common Sahyog questions through the options below.'); options(config.main); } }
  function open() { root.classList.add('is-open'); root.setAttribute('aria-hidden', 'false'); if (!messages.children.length) { say('Namaste! 👋\nWelcome to Sahyog Caring Bureau.\n\nI’m Sahyog’s automated assistant. I can help you understand our caretaker services, process and next steps.'); main(); } setTimeout(() => input.focus(), 0); }
  function close() { root.classList.remove('is-open'); root.setAttribute('aria-hidden', 'true'); }
  window.openSahyogChat = open;
  document.querySelectorAll('[data-open-sahyog-chat]').forEach((b) => b.addEventListener('click', open));
  root.querySelector('[data-chat-close]').addEventListener('click', close);
  root.querySelector('[data-chat-form]').addEventListener('submit', (e) => { e.preventDefault(); const value = input.value.trim(); if (!value) return; say(value, true); input.value = ''; answer(value); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('is-open')) close(); });
}());
