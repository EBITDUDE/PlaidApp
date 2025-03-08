// Simple reusable calendar component
class CalendarPicker {
    constructor(options = {}) {
        this.options = {
            inputSelector: null,              // Required: Input field selector
            format: 'MM/DD/YYYY',             // Output date format
            container: null,                  // Container element (optional)
            maxDate: null,                    // Maximum selectable date
            minDate: null,                    // Minimum selectable date
            startDate: null,                  // Initial calendar date to show
            onSelect: null,                   // Callback when date is selected
            closeOnSelect: true,              // Close calendar after selection
            ...options
        };
        
        // Validate required options
        if (!this.options.inputSelector) {
            console.error('CalendarPicker: inputSelector is required');
            return;
        }
        
        // Find input element
        this.inputElement = document.querySelector(this.options.inputSelector);
        if (!this.inputElement) {
            console.error(`CalendarPicker: Element with selector "${this.options.inputSelector}" not found`);
            return;
        }
        
        // Initialize state
        this.currentDate = this.options.startDate ? new Date(this.options.startDate) : new Date();
        this.selectedDate = null;
        
        // If input has a value, try to parse it
        if (this.inputElement.value) {
            try {
                this.selectedDate = this.parseDate(this.inputElement.value);
                this.currentDate = new Date(this.selectedDate);
            } catch (e) {
                console.warn('CalendarPicker: Could not parse input date', e);
            }
        }
        
        // Create calendar element
        this.calendarElement = this.createCalendarElement();
        
        // Add event listeners
        this.addEventListeners();
        
        // Initialize calendar display
        this.updateCalendar();
    }
    
    // Helper to create the calendar UI
    createCalendarElement() {
        // Create container element if not provided
        const container = this.options.container || document.createElement('div');
        container.className = 'calendar-picker';
        container.style.display = 'none';
        container.style.position = 'absolute';
        container.style.backgroundColor = 'white';
        container.style.border = '1px solid #ddd';
        container.style.borderRadius = '4px';
        container.style.padding = '10px';
        container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        container.style.zIndex = '1000';
        
        // Create calendar header
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '10px';
        
        // Previous month button
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'calendar-prev-btn';
        prevBtn.innerHTML = '&lt;';
        prevBtn.style.padding = '2px 5px';
        prevBtn.style.cursor = 'pointer';
        prevBtn.style.border = '1px solid #ddd';
        prevBtn.style.borderRadius = '3px';
        prevBtn.style.backgroundColor = '#f8f8f8';
        
        // Month/Year display
        const monthYear = document.createElement('div');
        monthYear.className = 'calendar-month-year';
        monthYear.style.fontWeight = 'bold';
        
        // Next month button
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'calendar-next-btn';
        nextBtn.innerHTML = '&gt;';
        nextBtn.style.padding = '2px 5px';
        nextBtn.style.cursor = 'pointer';
        nextBtn.style.border = '1px solid #ddd';
        nextBtn.style.borderRadius = '3px';
        nextBtn.style.backgroundColor = '#f8f8f8';
        
        // Add elements to header
        header.appendChild(prevBtn);
        header.appendChild(monthYear);
        header.appendChild(nextBtn);
        
        // Create weekdays header
        const weekdaysContainer = document.createElement('div');
        weekdaysContainer.className = 'calendar-weekdays';
        weekdaysContainer.style.display = 'grid';
        weekdaysContainer.style.gridTemplateColumns = 'repeat(7, 1fr)';
        weekdaysContainer.style.gap = '2px';
        weekdaysContainer.style.marginBottom = '5px';
        
        // Add weekday labels
        const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        weekdays.forEach(day => {
            const dayElem = document.createElement('div');
            dayElem.className = 'calendar-weekday';
            dayElem.textContent = day;
            dayElem.style.textAlign = 'center';
            dayElem.style.fontWeight = 'bold';
            dayElem.style.padding = '5px';
            weekdaysContainer.appendChild(dayElem);
        });
        
        // Create days container
        const daysContainer = document.createElement('div');
        daysContainer.className = 'calendar-days';
        daysContainer.style.display = 'grid';
        daysContainer.style.gridTemplateColumns = 'repeat(7, 1fr)';
        daysContainer.style.gap = '2px';
        
        // Add all elements to container
        container.appendChild(header);
        container.appendChild(weekdaysContainer);
        container.appendChild(daysContainer);
        
        // Append to document if not provided as option
        if (!this.options.container) {
            document.body.appendChild(container);
        }
        
        return container;
    }
    
    // Add event listeners
    addEventListeners() {
        // Input click - show calendar
        this.inputElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showCalendar();
        });
        
        // Make input readonly to prevent direct editing
        this.inputElement.readOnly = true;
        
        // Previous month button
        this.calendarElement.querySelector('.calendar-prev-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.prevMonth();
        });
        
        // Next month button
        this.calendarElement.querySelector('.calendar-next-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.nextMonth();
        });
        
        // Close calendar when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.calendarElement.contains(e.target) && e.target !== this.inputElement) {
                this.hideCalendar();
            }
        });
    }
    
    // Update calendar display
    updateCalendar() {
        // Update month/year header
        const monthYear = this.calendarElement.querySelector('.calendar-month-year');
        monthYear.textContent = this.formatMonthYear(this.currentDate);
        
        // Get days container
        const daysContainer = this.calendarElement.querySelector('.calendar-days');
        daysContainer.innerHTML = '';
        
        // Get first and last day of month
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        // Get day of week for first day (0 = Sunday)
        const firstDayOfWeek = firstDay.getDay();
        
        // Add days from previous month
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = 0; i < firstDayOfWeek; i++) {
            const dayElem = document.createElement('div');
            dayElem.className = 'calendar-day other-month';
            dayElem.textContent = prevMonthLastDay - firstDayOfWeek + i + 1;
            dayElem.style.textAlign = 'center';
            dayElem.style.padding = '6px';
            dayElem.style.color = '#aaa';
            daysContainer.appendChild(dayElem);
        }
        
        // Add days of current month
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const selectedDateStr = this.selectedDate ? 
            `${this.selectedDate.getFullYear()}-${this.selectedDate.getMonth()}-${this.selectedDate.getDate()}` : null;
        
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const date = new Date(year, month, i);
            date.setHours(0, 0, 0, 0);
            
            const dayElem = document.createElement('div');
            dayElem.className = 'calendar-day';
            dayElem.textContent = i;
            dayElem.style.textAlign = 'center';
            dayElem.style.padding = '6px';
            dayElem.style.cursor = 'pointer';
            dayElem.style.borderRadius = '4px';
            
            // Check if date is today
            if (date.getTime() === today.getTime()) {
                dayElem.style.fontWeight = 'bold';
                dayElem.style.border = '1px solid #3498db';
            }
            
            // Check if date is selected
            const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            if (dateStr === selectedDateStr) {
                dayElem.style.backgroundColor = '#3498db';
                dayElem.style.color = 'white';
            }
            
            // Check if date is within allowed range
            let disabled = false;
            
            if (this.options.minDate) {
                const minDate = new Date(this.options.minDate);
                minDate.setHours(0, 0, 0, 0);
                if (date < minDate) {
                    disabled = true;
                }
            }
            
            if (this.options.maxDate) {
                const maxDate = new Date(this.options.maxDate);
                maxDate.setHours(0, 0, 0, 0);
                if (date > maxDate) {
                    disabled = true;
                }
            }
            
            if (disabled) {
                dayElem.style.color = '#ddd';
                dayElem.style.cursor = 'default';
            } else {
                // Add click event for selectable dates
                dayElem.addEventListener('click', () => this.selectDate(date));
                
                // Hover effect
                dayElem.addEventListener('mouseover', () => {
                    if (dateStr !== selectedDateStr) {
                        dayElem.style.backgroundColor = '#f0f0f0';
                    }
                });
                
                dayElem.addEventListener('mouseout', () => {
                    if (dateStr !== selectedDateStr) {
                        dayElem.style.backgroundColor = '';
                    }
                });
            }
            
            daysContainer.appendChild(dayElem);
        }
        
        // Add days from next month
        const daysAdded = firstDayOfWeek + lastDay.getDate();
        const nextMonthDays = Math.max(0, 42 - daysAdded); // 6 rows of 7 days = 42
        for (let i = 1; i <= nextMonthDays; i++) {
            const dayElem = document.createElement('div');
            dayElem.className = 'calendar-day other-month';
            dayElem.textContent = i;
            dayElem.style.textAlign = 'center';
            dayElem.style.padding = '6px';
            dayElem.style.color = '#aaa';
            daysContainer.appendChild(dayElem);
        }
        
        // Position calendar relative to input element
        this.positionCalendar();
    }
    
    // Position calendar relative to input
    positionCalendar() {
        const inputRect = this.inputElement.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        this.calendarElement.style.top = (inputRect.bottom + scrollTop) + 'px';
        this.calendarElement.style.left = (inputRect.left + scrollLeft) + 'px';
        this.calendarElement.style.minWidth = inputRect.width + 'px';
    }
    
    // Show calendar
    showCalendar() {
        this.calendarElement.style.display = 'block';
        this.positionCalendar();
        this.updateCalendar();
    }
    
    // Hide calendar
    hideCalendar() {
        this.calendarElement.style.display = 'none';
    }
    
    // Previous month
    prevMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.updateCalendar();
    }
    
    // Next month
    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.updateCalendar();
    }
    
    // Select a date
    selectDate(date) {
        this.selectedDate = date;
        
        // Update input value
        this.inputElement.value = this.formatDate(date);
        
        // Call onSelect callback if provided
        if (typeof this.options.onSelect === 'function') {
            this.options.onSelect(date, this.formatDate(date));
        }
        
        // Close calendar if closeOnSelect is true
        if (this.options.closeOnSelect) {
            this.hideCalendar();
        } else {
            this.updateCalendar();
        }
    }
    
    // Format date based on specified format
    formatDate(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        
        let formatted = this.options.format;
        formatted = formatted.replace('YYYY', year);
        formatted = formatted.replace('MM', month);
        formatted = formatted.replace('DD', day);
        
        return formatted;
    }
    
    // Format month and year for header
    formatMonthYear(date) {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }
    
    // Parse date from string
    parseDate(dateStr) {
        // Try to detect format
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // ISO format: YYYY-MM-DD
            const [year, month, day] = dateStr.split('-').map(Number);
            return new Date(year, month - 1, day);
        } else if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            // US format: MM/DD/YYYY
            const [month, day, year] = dateStr.split('/').map(Number);
            return new Date(year, month - 1, day);
        } else {
            throw new Error(`Unsupported date format: ${dateStr}`);
        }
    }
}