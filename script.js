// JavaScript to fetch and display system stats

// Function to fetch system stats
function getSystemStats() {
    // Replace with actual system stats fetching logic
    // For demonstration, we'll use static data
    const stats = {
        cpu: '25%',
        memory: '1500',
        disk: '500',
        gpu: '10%'
    };

    // Update the DOM with the stats
    document.getElementById('cpu').textContent = stats.cpu;
    document.getElementById('memory').textContent = stats.memory;
    document.getElementById('disk').textContent = stats.disk;
    document.getElementById('gpu').textContent = stats.gpu;
}

// Function to update the status
function updateStatus(text) {
    document.getElementById('status-text').textContent = text;
}

// Function to add a task to the history
function addTask(task) {
    const li = document.createElement('li');
    li.textContent = task;
    document.getElementById('task-list').appendChild(li);
}

// Function to update the gateway status
function updateGatewayStatus(text) {
    document.getElementById('gateway-text').textContent = text;
}

// Initial calls to populate the dashboard
getSystemStats();
updateStatus('Ready');
addTask('Dashboard loaded');
updateGatewayStatus('Online');