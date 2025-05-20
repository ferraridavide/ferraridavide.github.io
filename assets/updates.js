const apiKey = "AIzaSyC1KbMFmBgmv9RI3rh2nxbtJcjowcZYj04";
const calendarId =
  "46196ad62c0e924ea7cac304c6d1c31419883175691a7adbc708300b43a341d8@group.calendar.google.com";
const maxResults = 2500;

const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?key=${apiKey}&maxResults=${maxResults}&orderBy=updated&singleEvents=true`;

fetch(url)
  .then((response) => response.json())
  .then((data) => {
    const events = data.items;

    const dateAccessor = (e) => e.start.date ?? e.start.dateTime;

    events.sort(
      (a, b) =>
        new Date(Date.parse(dateAccessor(b))) -
        new Date(Date.parse(dateAccessor(a)))
    );
    const cont = document.getElementById("updates-container");

    const grouped = Object.groupBy(events, (e) => {
      const start = new Date(Date.parse(dateAccessor(e)));

      const yyyy = start.getFullYear();
      const monthName = start.toLocaleString("default", { month: "long" });
      return `${monthName} ${yyyy}`;
    });

    Object.keys(grouped).forEach((monthYear) => {
      console.log(monthYear);

      const p = document.createElement("p");
      p.innerHTML = monthYear;
      cont.appendChild(p);

      grouped[monthYear].forEach((event) => {
        const div = document.createElement("div");
        div.classList.add("event");
        const span = document.createElement("span");
        span.innerHTML = event.summary;
        div.appendChild(span);
        cont.appendChild(div);
      });

    });
  });
