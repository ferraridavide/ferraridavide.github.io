const ele = document.querySelector('.timelineContainer');
const now = document.querySelector('.now');
const markers = document.querySelector(".timeMarkers");
const indefinite = document.querySelectorAll(".indefinite");
const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const monthEnd = monthsBetweenDateAndNow(new Date('2022-01-01')) + 6;

indefinite.forEach((x) => x.style.setProperty('--months', monthEnd))

for (let i = 0; i != monthEnd - 1; i++){
    var span = document.createElement("span");
    span.innerText = months[i%12] + " " + (Math.floor(i/12) + 2022)
    markers.appendChild(span)
}


now.style.left = ((monthsBetweenDateAndNow(new Date('2022-01-01')) + getProgressInCurrentMonth()) * 120) + "px";

function monthsBetweenDateAndNow(date) {
    const now = new Date();
    const diffInMonths = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
    return diffInMonths >= 0 ? diffInMonths : 0;
}

function getProgressInCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const dayOfMonth = now.getDate();
    return dayOfMonth / daysInMonth;
  }

ele.scrollLeft = now.offsetLeft + (now.offsetWidth - ele.offsetWidth) / 2;

let pos = { top: 0, left: 0, x: 0, y: 0 };

ele.addEventListener("wheel", (e) => {
    e.preventDefault();
    ele.scrollLeft += e.deltaY;
});

const mouseDownHandler = function (e) {
    ele.style.cursor = 'grabbing';
    ele.style.userSelect = 'none';
    pos = {
        left: ele.scrollLeft,
        top: ele.scrollTop,
        x: e.clientX,
        y: e.clientY,
    };

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
};

const mouseMoveHandler = function (e) {
    const dx = e.clientX - pos.x;
    const dy = e.clientY - pos.y;
    ele.scrollTop = pos.top - dy;
    ele.scrollLeft = pos.left - dx;
};

const mouseUpHandler = function () {
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);

    ele.style.cursor = 'grab';
    ele.style.removeProperty('user-select');
};

ele.addEventListener('mousedown', mouseDownHandler);
ele.addEventListener('mouseup', mouseUpHandler);