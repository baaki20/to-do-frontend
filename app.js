// --- 1. CONFIGURATION: Use Environment Variables ---

// Amplify Hosting injects environment variables prefixed with REACT_APP_
// These must be defined first, before Amplify.configure() is called.

// Read variables from the environment (Amplify build process)
const USER_POOL_ID = process.env.REACT_APP_USER_POOL_ID; 
const CLIENT_ID = process.env.REACT_APP_USER_POOL_CLIENT_ID;
const API_URL = process.env.REACT_APP_API_URL;
const REGION = 'eu-north-1'; // Ensure this matches your deployment region

// Configure Amplify
Amplify.configure({
    Auth: {
        userPoolId: USER_POOL_ID,
        userPoolWebClientId: CLIENT_ID,
        region: REGION
    },
    API: {
        endpoints: [
            {
                name: "TodoAppApi",
                endpoint: API_URL,
                region: REGION,
                // Function to retrieve the JWT for every authenticated API request
                custom_header: async () => {
                    try {
                        // The Auth object is now guaranteed to be available
                        const session = await Amplify.Auth.currentSession();
                        return { 
                            Authorization: session.getIdToken().getJwtToken() 
                        };
                    } catch (e) {
                        // If session fails, it means the user is not signed in
                        return {};
                    }
                }
            }
        ]
    }
});

// Destructure Amplify services *after* configuration
const { Auth, API } = Amplify;

// --- 2. AUTHENTICATION FUNCTIONS ---

async function signUp() {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const messageEl = document.getElementById('signup-message');

    try {
        await Auth.signUp({ 
            username: email, 
            password,
            attributes: { email } 
        });
        messageEl.textContent = "Sign Up Success! User created. Sign In now.";
        messageEl.style.color = 'green';
    } catch (error) {
        messageEl.textContent = `Error signing up: ${error.message}`;
        messageEl.style.color = 'red';
        console.error("Sign Up Error:", error);
    }
}

async function signIn() {
    const email = document.getElementById('signin-email').value;
    const password = document.getElementById('signin-password').value;
    const messageEl = document.getElementById('signin-message');

    try {
        await Auth.signIn(email, password);
        messageEl.textContent = "Sign In Success!";
        messageEl.style.color = 'green';
        updateUIAfterAuth(true); // Show task section
        fetchTasks();
    } catch (error) {
        messageEl.textContent = `Error signing in: ${error.message}`;
        messageEl.style.color = 'red';
        console.error("Sign In Error:", error);
    }
}

async function signOut() {
    try {
        await Auth.signOut();
        document.getElementById('signin-message').textContent = "Signed Out.";
        document.getElementById('signin-message').style.color = 'blue';
        updateUIAfterAuth(false); // Hide task section
    } catch (error) {
        console.error('Error signing out:', error);
    }
}

// --- 3. UI MANAGEMENT ---

function updateUIAfterAuth(isAuthenticated) {
    document.getElementById('auth-section').style.display = isAuthenticated ? 'none' : 'block';
    document.getElementById('app-section').style.display = isAuthenticated ? 'block' : 'none';
}

async function checkAuthStatus() {
    try {
        await Auth.currentSession();
        updateUIAfterAuth(true);
        fetchTasks();
    } catch {
        updateUIAfterAuth(false);
    }
}

window.onload = checkAuthStatus;

// --- 4. TASK MANAGEMENT (CRUD) ---

async function fetchTasks() {
    try {
        const tasks = await API.get('TodoAppApi', '/tasks');
        displayTasks(tasks);
    } catch (error) {
        console.error("Error fetching tasks:", error);
        document.getElementById('task-list').innerHTML = `<p style="color:red;">Error loading tasks: ${error.message}</p>`;
    }
}

function displayTasks(tasks) {
    const taskListEl = document.getElementById('task-list');
    taskListEl.innerHTML = ''; // Clear existing list

    if (tasks.length === 0) {
        taskListEl.innerHTML = '<p>No tasks found. Create one above!</p>';
        return;
    }

    tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = `task-item ${task.Status}`;
        
        const details = document.createElement('span');
        details.innerHTML = `
            <strong>${task.Description}</strong> (Status: <span class="task-status">${task.Status}</span>)
            <br>
            <small>Created: ${new Date(task.Date).toLocaleDateString()}</small>
        `;
        
        const actions = document.createElement('div');
        actions.className = 'task-actions';

        if (task.Status === 'Pending') {
            const completeBtn = document.createElement('button');
            completeBtn.textContent = 'Complete';
            completeBtn.style.backgroundColor = 'green';
            completeBtn.onclick = () => updateTask(task.TaskId, 'Completed');
            actions.appendChild(completeBtn);
        }
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.backgroundColor = '#dc3545';
        deleteBtn.onclick = () => deleteTask(task.TaskId);
        actions.appendChild(deleteBtn);

        item.appendChild(details);
        item.appendChild(actions);
        taskListEl.appendChild(item);
    });
}

async function createTask() {
    const description = document.getElementById('task-description').value;
    if (!description) return;

    try {
        await API.post('TodoAppApi', '/tasks', { body: { Description: description } });
        document.getElementById('task-description').value = '';
        fetchTasks(); // Refresh list
    } catch (error) {
        console.error("Error creating task:", error);
    }
}

async function updateTask(taskId, status) {
    try {
        await API.put('TodoAppApi', `/tasks/${taskId}`, { body: { Status: status } });
        fetchTasks(); // Refresh list
    } catch (error) {
        console.error("Error updating task:", error);
    }
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
        await API.del('TodoAppApi', `/tasks/${taskId}`);
        fetchTasks(); // Refresh list
    } catch (error) {
        console.error("Error deleting task:", error);
    }
}