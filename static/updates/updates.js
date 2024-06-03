const apiKey = 'AIzaSyC1KbMFmBgmv9RI3rh2nxbtJcjowcZYj04';
        const calendarId = '46196ad62c0e924ea7cac304c6d1c31419883175691a7adbc708300b43a341d8@group.calendar.google.com';
        const maxResults = 2500;

        const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?key=${apiKey}&maxResults=${maxResults}&orderBy=updated&singleEvents=true`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                const events = data.items;

                const dateAccessor = e => e.start.date ?? e.start.dateTime;

                events.sort((a, b) => new Date(Date.parse(dateAccessor(b))) - new Date(Date.parse(dateAccessor(a))));
                const cont = document.getElementById('cont');
                
                const grouped = Object.groupBy(events, e => {
                    const start = new Date(Date.parse(dateAccessor(e)));
                    
                    const yyyy = start.getFullYear();
                    let mm = start.getMonth() + 1; // Months start at 0!
                    let dd = start.getDate();
                    
                    
                    if (dd < 10) dd = '0' + dd;
                    if (mm < 10) mm = '0' + mm;
                    return `${dd}/${mm}/${yyyy}`
                })
                
                Object.keys(grouped).forEach(date => {
                    
                    console.log(date)
                    
                    const p = document.createElement('p');
                    p.innerHTML = date;
                    cont.appendChild(p);

                    grouped[date].forEach(event => {
                        const div = document.createElement('div');
                        div.classList.add('event');
                        div.innerHTML = `
                            <span>${event.summary}</span>
                        `;
                        cont.appendChild(div);
                    });
                });
            });