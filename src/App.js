import React, { useState, useEffect, useCallback } from 'react';
import { Amplify } from 'aws-amplify';
import { signUp, signIn, signOut, getCurrentUser, confirmSignUp, fetchAuthSession } from 'aws-amplify/auth';
import './App.css';

// Configure Amplify with your backend outputs
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.REACT_APP_USER_POOL_ID,
      userPoolClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID,
      region: process.env.REACT_APP_REGION,
    }
  }
});

const API_ENDPOINT = process.env.REACT_APP_API_URL;

function App() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Auth form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');

  // Task form state
  const [newTaskDescription, setNewTaskDescription] = useState('');
  
  // Filter state
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'completed', 'expired'

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setUser(null);
    }
  };

  const getAuthToken = useCallback(async () => {
    try {
      const { tokens } = await fetchAuthSession({ forceRefresh: true });
      return tokens?.idToken?.toString();
    } catch (err) {
      console.error('Error getting token:', err);
      return null;
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_ENDPOINT}/tasks`, {
        headers: {
          'Authorization': token
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch tasks');
      
      const data = await response.json();
      setTasks(data.Items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthToken]);

  useEffect(() => {
    // This check is to prevent fetching tasks when the user object is present
    // but the session might not be fully established yet.
    if (user?.userId) {
      fetchTasks();
    }
  }, [user, fetchTasks]);
  
  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    if (needsConfirmation) {
      try {
        const { isSignUpComplete, nextStep } = await confirmSignUp({
          username: email,
          confirmationCode,
        });
        console.log('Confirmation result:', { isSignUpComplete, nextStep });
        if (isSignUpComplete) {
          setNeedsConfirmation(false);
          setConfirmationCode('');
          // Automatically sign in after confirmation
          await handleSignIn(e, true);
        } else {
          setError('Confirmation failed, please try again.');
        }
      } catch (err) {
        console.error('Confirmation error:', err);
        setError(err.message || 'Invalid confirmation code.');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const { isSignUpComplete, nextStep } = await signUp({
        username: email,
        password: password,
        options: {
          userAttributes: {
            email: email
          },
          autoSignIn: true,
        }
      });
      
      console.log('Sign up result:', { isSignUpComplete, nextStep });
      
      if (isSignUpComplete) {
        await checkUser(); // autoSignIn should have created a session
      } else if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        setNeedsConfirmation(true);
        setError('A confirmation code has been sent to your email.');
      }
    } catch (err) {
      console.error('Sign up error:', err);
      setError(err.message || 'Failed to sign up. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e, skipPrevent = false) => {
    if (!skipPrevent) e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const { isSignedIn, nextStep } = await signIn({
        username: email, 
        password: password 
      });
      
      console.log('Sign in result:', { isSignedIn, nextStep });

      if (isSignedIn) {
        await checkUser();
      } else if (nextStep.signInStep === 'CONFIRM_SIGN_UP') {
        setNeedsConfirmation(true);
        setError('Your account is not confirmed. Please enter the confirmation code sent to your email.');
      } else {
        // Handle other steps like MFA if you have them enabled
        setError('Sign in incomplete. Please try again.');
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setTasks([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    if (!newTaskDescription.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_ENDPOINT}/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ Description: newTaskDescription })
      });
      
      if (!response.ok) throw new Error('Failed to create task');
      
      setNewTaskDescription('');
      await fetchTasks();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    setLoading(true);
    setError('');
    
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_ENDPOINT}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ Status: newStatus })
      });
      
      if (!response.ok) throw new Error('Failed to update task');
      
      await fetchTasks();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    
    setLoading(true);
    setError('');
    
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_ENDPOINT}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token
        }
      });
      
      if (!response.ok) throw new Error('Failed to delete task');
      
      await fetchTasks();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredTasks = () => {
    if (filter === 'all') return tasks;
    return tasks.filter(task => task.Status.toLowerCase() === filter.toLowerCase());
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getTaskId = (sk) => {
    return sk.split('#')[1];
  };

  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>📝 Todo App</h1>
          <h2>{isSignUp ? 'Sign Up' : 'Sign In'}</h2>
          
          {error && <div className="error-message">{error}</div>}
          
          <form onSubmit={needsConfirmation ? handleSignUp : (isSignUp ? handleSignUp : handleSignIn)}>
            {!needsConfirmation ? (
              <>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength="8"
                />
              </>
            ) : (
              <input
                type="text"
                placeholder="Confirmation Code"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                required
              />
            )}
            <button type="submit" disabled={loading}>
              {loading ? 'Loading...' : (needsConfirmation ? 'Confirm Account' : (isSignUp ? 'Sign Up' : 'Sign In'))}
            </button>
          </form>
          
          <p className="toggle-auth">
            {needsConfirmation ? (
              <button onClick={() => { setNeedsConfirmation(false); setError(''); }}>Back to Sign In</button>
            ) : (
              <>{isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button onClick={() => setIsSignUp(!isSignUp)}>{isSignUp ? 'Sign In' : 'Sign Up'}</button></>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>📝 My Todo List</h1>
        <div className="user-info">
          <span>{user.username}</span>
          <button onClick={handleSignOut} className="sign-out-btn">Sign Out</button>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="content">
        <div className="create-task-section">
          <form onSubmit={createTask} className="task-form">
            <input
              type="text"
              placeholder="What needs to be done?"
              value={newTaskDescription}
              onChange={(e) => setNewTaskDescription(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading}>
              Add Task
            </button>
          </form>
        </div>

        <div className="filter-section">
          <button 
            className={filter === 'all' ? 'active' : ''} 
            onClick={() => setFilter('all')}
          >
            All ({tasks.length})
          </button>
          <button 
            className={filter === 'pending' ? 'active' : ''} 
            onClick={() => setFilter('pending')}
          >
            Pending ({tasks.filter(t => t.Status === 'Pending').length})
          </button>
          <button 
            className={filter === 'completed' ? 'active' : ''} 
            onClick={() => setFilter('completed')}
          >
            Completed ({tasks.filter(t => t.Status === 'Completed').length})
          </button>
          <button 
            className={filter === 'expired' ? 'active' : ''} 
            onClick={() => setFilter('expired')}
          >
            Expired ({tasks.filter(t => t.Status === 'Expired').length})
          </button>
        </div>

        <div className="tasks-list">
          {loading && <div className="loading">Loading tasks...</div>}
          
          {!loading && getFilteredTasks().length === 0 && (
            <div className="empty-state">
              <p>No tasks found</p>
            </div>
          )}
          
          {!loading && getFilteredTasks().map(task => (
            <div key={task.SK} className={`task-card ${task.Status.toLowerCase()}`}>
              <div className="task-content">
                <h3>{task.Description}</h3>
                <div className="task-meta">
                  <span className="task-date">Created: {formatDate(task.Date)}</span>
                  <span className="task-deadline">Deadline: {formatDate(task.Deadline)}</span>
                </div>
                <span className={`task-status ${task.Status.toLowerCase()}`}>
                  {task.Status}
                </span>
              </div>
              
              <div className="task-actions">
                {task.Status === 'Pending' && (
                  <button 
                    onClick={() => updateTaskStatus(getTaskId(task.SK), 'Completed')}
                    className="complete-btn"
                    disabled={loading}
                  >
                    ✓ Complete
                  </button>
                )}
                <button 
                  onClick={() => deleteTask(getTaskId(task.SK))}
                  className="delete-btn"
                  disabled={loading}
                >
                  🗑 Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;