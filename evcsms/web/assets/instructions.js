/**
 * Instructions & Documentation State Manager
 */

const Instructions = {
    sections: {
        'index': { title: 'Instruktioner & Dokumentation', subtitle: 'Välj ett ämne nedan för att komma igång.' },
        'onboarding': { title: 'Kom igång med laddare', subtitle: 'Steg-för-steg guide för att ansluta hårdvara.' },
        'organizations': { title: 'Organisationer', subtitle: 'Hantera företag och hierarkier.' },
        'rfid': { title: 'RFID-hantering', subtitle: 'Lägg till och hantera användarkort.' },
        'ocpp16': { title: 'OCPP 1.6J Deep Dive', subtitle: 'Teknisk referens för 1.6J-protokollet.' },
        'ocpp201': { title: 'OCPP 2.0.1 Deep Dive', subtitle: 'Teknisk referens för 2.0.1-protokollet.' }
    },

    init() {
        console.log("Instructions UI Initializing...");
        this.handleHashChange();
        window.addEventListener('hashchange', () => this.handleHashChange());
    },

    handleHashChange() {
        const hash = window.location.hash.replace('#', '');
        if (this.sections[hash]) {
            this.showSection(hash, false);
        } else {
            this.showSection('index', false);
        }
    },

    showSection(id, updateHash = true) {
        if (!this.sections[id]) id = 'index';

        // Update UI Visibility
        document.querySelectorAll('.instruction-section, #instructions-index').forEach(el => el.classList.add('d-none'));
        
        if (id === 'index') {
            document.getElementById('instructions-index').classList.remove('d-none');
            document.getElementById('btn-back-to-index').classList.add('d-none');
        } else {
            const sectionEl = document.getElementById('section-' + id);
            if (sectionEl) sectionEl.classList.remove('d-none');
            document.getElementById('btn-back-to-index').classList.remove('d-none');
        }

        // Update Header
        const config = this.sections[id];
        document.getElementById('page-title').innerText = config.title;
        document.getElementById('page-subtitle').innerText = config.subtitle;

        // Update Hash
        if (updateHash) {
            if (id === 'index') {
                // Remove hash without reload
                history.pushState("", document.title, window.location.pathname + window.location.search);
            } else {
                window.location.hash = id;
            }
        }

        // Scroll to top
        window.scrollTo(0, 0);
    }
};

// Global accessor for onclick events
window.showSection = (id) => Instructions.showSection(id);

document.addEventListener('DOMContentLoaded', () => {
    // Only init if we are on the instructions page
    if (document.getElementById('instructions-index')) {
        Instructions.init();
    }
});
