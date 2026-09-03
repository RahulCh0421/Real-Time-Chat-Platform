import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css'; // We'll add styles here

const socket = io('http://localhost:3000');

function App() {
  const [passkey, setPasskey] = useState('');
  const [username, setUsername] = useState('');
  const [admin, setAdmin] = useState('');
  const [joined, setJoined] = useState(false);
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [showParticipantsFlag, setShowParticipantsFlag] = useState(false);

  const joinSession = () => {
    if (!passkey || !username) return alert('Enter username and passkey');
    socket.emit('join', { passkey, username });
  };

  const createSession = async () => {
    if (!passkey || !username) return alert('Enter username and passkey');
    setAdmin(username);

    try {
      const res = await fetch('http://localhost:3000/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey, admin: username }),
      });
      const data = await res.json();
      if (data.error) return alert(data.error);

      joinSession();
    } catch (err) {
      alert('Failed to create session');
    }
  };

  const sendMessage = () => {
    if (!message) return;
    socket.emit('message', { passkey, username, message });
    setMessage('');
  };

  const showParticipants = () => {
    if (!passkey) return;
    socket.emit('participants', { passkey });
    setShowParticipantsFlag(true);
  };

  const terminateChat = () => {
    if (!window.confirm('Are you sure? This will close the chat for everyone.')) return;
    socket.emit('terminate', { passkey, username });
  };

  useEffect(() => {
    socket.on('joined', ({ username: joinedUser, participants }) => {
      setJoined(true);
      setParticipants(participants);
      setChat(prev => [...prev, `${joinedUser} joined the chat`]);
    });

    socket.on('message', ({ username, message }) => {
      setChat(prev => [...prev, `${username}: ${message}`]);
    });

    socket.on('participants', (list) => {
      setParticipants(list);
    });

    socket.on('terminated', (msg) => {
      alert(msg);
      setJoined(false);
      setChat([]);
      setParticipants([]);
      setAdmin('');
      setShowParticipantsFlag(false);
    });

    socket.on('error', (msg) => alert(msg));

    return () => {
      socket.off('joined');
      socket.off('message');
      socket.off('participants');
      socket.off('terminated');
      socket.off('error');
    };
  }, []);

  return (
    <div className="app-container">
      {!joined ? (
        <div className="login-card">
          <h2>Ephemeral Chat</h2>
          <input className="input-field" placeholder="Username" onChange={e => setUsername(e.target.value)} />
          <input className="input-field" placeholder="Passkey" onChange={e => setPasskey(e.target.value)} />
          <div className="button-group">
            <button className="primary-btn" onClick={createSession}>Create Chat (Admin)</button>
            <button className="secondary-btn" onClick={joinSession}>Join Chat</button>
          </div>
        </div>
      ) : (
        <div className="chat-container">
          <div className="chat-header">
            <button className="primary-btn" onClick={showParticipants}>👁️ Show Participants</button>
            {username === admin && (
              <button className="terminate-btn" onClick={terminateChat}>🛑 Terminate Chat</button>
            )}
          </div>
          {showParticipantsFlag && <div className="participants">Participants: {participants.join(', ')}</div>}
          <div className="chat-box">
            {chat.map((m, i) => (
              <div key={i} className={`chat-message ${m.startsWith(username + ':') ? 'own-msg' : 'other-msg'}`}>
                {m}
              </div>
            ))}
          </div>
          <div className="input-area">
            <input
              className="input-field"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type a message..."
            />
            <button className="primary-btn" onClick={sendMessage}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
