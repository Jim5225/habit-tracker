import { supabase } from '../supabase.js';
import { format, addDays, differenceInCalendarDays, parseISO } from 'date-fns';

export async function renderFollowUpView(container) {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  async function loadData() {
    const { data: contacts, error } = await supabase
      .from('friends_followup')
      .select('*')
      .order('name');
      
    if (error) {
      console.error(error);
      container.innerHTML = `<p style="color:var(--accent-red)">Error loading follow-ups.</p>`;
      return;
    }

    renderUI(contacts || []);
  }

  function renderUI(contacts) {
    const processedContacts = contacts.map(c => {
      const lastContactDate = parseISO(c.last_communicated);
      const nextContactDate = addDays(lastContactDate, c.interval_days);
      const daysLeft = differenceInCalendarDays(nextContactDate, today);

      let status = 'safe';
      let statusText = `${daysLeft} days left`;
      
      if (daysLeft < 0) {
        status = 'overdue';
        statusText = `Overdue by ${Math.abs(daysLeft)} days 🚨`;
      } else if (daysLeft === 0) {
        status = 'due-today';
        statusText = 'Due Today ⏳';
      }

      return {
        ...c,
        nextContactDate,
        daysLeft,
        status,
        statusText
      };
    });

    // Sort contacts: overdue first, then due-today, then safe
    processedContacts.sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (a.status !== 'overdue' && b.status === 'overdue') return 1;
      if (a.status === 'due-today' && b.status === 'safe') return -1;
      if (a.status === 'safe' && b.status === 'due-today') return 1;
      return a.daysLeft - b.daysLeft; // sort by closer due date
    });

    const overdueCount = processedContacts.filter(c => c.status === 'overdue').length;
    const dueTodayCount = processedContacts.filter(c => c.status === 'due-today').length;

    const contactCardsHtml = processedContacts.map(c => `
      <div class="card friend-card">
        <div class="friend-info">
          <div class="friend-name">${c.name}</div>
          <div class="friend-meta">Category: <strong>${c.category}</strong></div>
          <div class="friend-meta">Last Contacted: ${format(parseISO(c.last_communicated), 'MMM d, yyyy')}</div>
          <div class="friend-meta">Next Due: ${format(c.nextContactDate, 'MMM d, yyyy')} (Every ${c.interval_days} days)</div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
          <span class="status-indicator ${c.status}">${c.statusText}</span>
          <div style="display:flex; gap:8px;">
            <button class="btn-contacted" onclick="markContacted('${c.id}')">Contacted Today</button>
            <button class="delete-btn" onclick="deleteContact('${c.id}')" style="margin-top:0;">Delete</button>
          </div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="view-container">
        <h1>Social Connections & Follow-ups</h1>
        <p class="subtitle">Keep in touch with friends and family. Don't lose connections!</p>

        <!-- Stats Overview -->
        <div class="budget-summary-grid">
          <div class="card summary-card">
            <h3>Total Contacts</h3>
            <div class="summary-value" style="color:var(--text-primary);">${contacts.length}</div>
          </div>
          <div class="card summary-card">
            <h3>Overdue Follow-ups</h3>
            <div class="summary-value expense">${overdueCount}</div>
          </div>
          <div class="card summary-card">
            <h3>Due Today</h3>
            <div class="summary-value" style="color:var(--accent-orange);">${dueTodayCount}</div>
          </div>
        </div>

        <div class="followup-grid">
          <!-- Add Contact Form -->
          <div>
            <div class="card">
              <h2>Add New Connection</h2>
              <form id="add-contact-form" style="margin-top:16px;">
                <div class="input-group">
                  <label for="contact-name">Full Name</label>
                  <input type="text" id="contact-name" placeholder="e.g. Jihan, Wife, John Doe" required>
                </div>
                <div class="input-group">
                  <label for="contact-category">Category</label>
                  <select id="contact-category" required>
                    <option value="" disabled selected>Select category</option>
                    <option value="Family">Family</option>
                    <option value="Friends">Friends</option>
                    <option value="Wife's Special">Wife's Special</option>
                    <option value="Professional">Professional</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div class="input-group">
                  <label for="contact-interval">Follow-up Interval (Days)</label>
                  <input type="number" id="contact-interval" value="20" min="1" required>
                </div>
                <div class="input-group">
                  <label for="contact-last-date">Last Communicated Date</label>
                  <input type="date" id="contact-last-date" value="${todayStr}" required>
                </div>
                <button type="submit" style="width:100%;">Save Connection</button>
              </form>
            </div>
          </div>

          <!-- Contacts List -->
          <div>
            <h2>Follow-up Pacing List</h2>
            <div style="margin-top:16px;">
              ${contactCardsHtml || '<p style="color:var(--text-secondary); text-align:center; padding:40px;">No connections added yet. Add someone on the left to start tracking!</p>'}
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    document.getElementById('add-contact-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('contact-name').value.trim();
      const category = document.getElementById('contact-category').value;
      const interval_days = parseInt(document.getElementById('contact-interval').value) || 20;
      const last_communicated = document.getElementById('contact-last-date').value;

      const { error } = await supabase.from('friends_followup').insert({
        name,
        category,
        interval_days,
        last_communicated
      });

      if (error) {
        alert("Error saving connection: " + error.message);
      } else {
        loadData();
      }
    });

    window.markContacted = async (id) => {
      const { error } = await supabase
        .from('friends_followup')
        .update({ last_communicated: todayStr })
        .eq('id', id);

      if (error) {
        alert("Error updating connection: " + error.message);
      } else {
        loadData();
      }
    };

    window.deleteContact = async (id) => {
      if (confirm("Are you sure you want to delete this contact?")) {
        const { error } = await supabase
          .from('friends_followup')
          .delete()
          .eq('id', id);

        if (error) {
          alert("Error deleting connection: " + error.message);
        } else {
          loadData();
        }
      }
    };
  }

  loadData();
}
