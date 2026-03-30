import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "motion/react";
import Peer from "simple-peer";
import { 
  Send, 
  Users, 
  Hash, 
  Smile, 
  LogOut, 
  MessageSquare, 
  Circle, 
  ChevronRight,
  User as UserIcon,
  Settings,
  Search,
  Menu,
  X,
  Video,
  Phone,
  PhoneOff,
  Plus,
  MoreVertical,
  Shield,
  AlertCircle,
  LogIn,
  Mic,
  MicOff,
  Monitor,
  Bell,
  BellOff
} from "lucide-react";
import { 
  auth, 
  db, 
  googleProvider, 
  handleFirestoreError, 
  OperationType 
} from "./firebase";
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser 
} from "firebase/auth";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  doc, 
  orderBy, 
  limit, 
  serverTimestamp, 
  getDocs,
  Timestamp
} from "firebase/firestore";


// Types
interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  roomId: string;
  timestamp: string;
  to?: string;
}

interface User {
  id: string;
  uid: string;
  name: string;
  color: string;
  room: string;
}

interface Notification {
  id: string;
  text: string;
  type: "info" | "success" | "error";
}

const ROOMS = ["General", "Development", "Design", "Random"];
const COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
];

export function AppContent() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [username, setUsername] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("General");
  const [availableRooms, setAvailableRooms] = useState<any[]>([]);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [globalUsers, setGlobalUsers] = useState<User[]>([]);
  const [privateChatWith, setPrivateChatWith] = useState<User | null>(null);
  const [inputText, setInputText] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showRoomCreator, setShowRoomCreator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");

  // Call State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerSignal, setCallerSignal] = useState<any>(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [idToCall, setIdToCall] = useState("");
  const [callEnded, setCallEnded] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [name, setName] = useState("");
  const [isCalling, setIsCalling] = useState(false);
  const [callType, setCallType] = useState<"video" | "voice">("video");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<Peer.Instance | null>(null);
  const isCallActiveRef = useRef(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setUsername(user.displayName || "Anonymous");
        
        // Fetch user profile from Firestore to get color
        try {
          const userDoc = await getDocs(query(collection(db, "users"), where("uid", "==", user.uid)));
          if (!userDoc.empty) {
            const userData = userDoc.docs[0].data();
            setSelectedColor(userData.color || COLORS[0]);
          } else {
            // Create profile if not exists
            await setDoc(doc(db, "users", user.uid), {
              uid: user.uid,
              name: user.displayName || "Anonymous",
              color: selectedColor,
              lastSeen: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
        
        setIsLoggedIn(true);
      } else {
        setCurrentUser(null);
        setIsLoggedIn(false);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const showNotification = (title: string, options?: NotificationOptions) => {
    if (Notification.permission === "granted") {
      new Notification(title, options);
    }
  };

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      console.log("This browser does not support desktop notification");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      showNotification("Notificações Ativadas!", {
        body: "Você agora receberá alertas de chamadas e mensagens.",
        icon: "/favicon.ico"
      });
    }
  };

  useEffect(() => {
    if (isLoggedIn && notificationPermission === "default") {
      requestNotificationPermission();
    }
  }, [isLoggedIn, notificationPermission]);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  // Connect to socket for signaling
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;

    const newSocket = io();
    setSocket(newSocket);

    // Join room for signaling
    newSocket.emit("join-room", { 
      name: username, 
      room: selectedRoom, 
      color: selectedColor,
      uid: currentUser.uid 
    });

    return () => {
      newSocket.close();
    };
  }, [isLoggedIn, currentUser]);

  // Firestore Listeners
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;

    // Listen for Rooms
    const roomsQuery = query(collection(db, "rooms"), orderBy("name", "asc"));
    const unsubscribeRooms = onSnapshot(roomsQuery, (snapshot) => {
      const roomsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAvailableRooms(roomsData.length > 0 ? roomsData : ROOMS.map(r => ({ id: r, name: r })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "rooms"));

    // Listen for Users
    const usersQuery = query(collection(db, "users"), limit(50));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as any));
      setGlobalUsers(usersData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "users"));

    return () => {
      unsubscribeRooms();
      unsubscribeUsers();
    };
  }, [isLoggedIn, currentUser]);

  // Messages Listener
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;

    let roomId = selectedRoom;
    if (privateChatWith) {
      const ids = [currentUser.uid, privateChatWith.id].sort();
      roomId = `private_${ids[0]}_${ids[1]}`;
    }

    const messagesQuery = query(
      collection(db, "messages"),
      where("roomId", "==", roomId),
      orderBy("timestamp", "asc"),
      limit(100)
    );

    let isInitialLoad = true;
    const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp ? (data.timestamp as Timestamp).toDate().toISOString() : new Date().toISOString()
        } as Message;
      });

      if (!isInitialLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const data = change.doc.data();
            if (data.senderId !== currentUser.uid) {
              showNotification(`Nova mensagem de ${data.senderName}`, {
                body: data.text,
                icon: data.senderPhoto || "/favicon.ico"
              });
            }
          }
        });
      }
      isInitialLoad = false;
      setMessages(msgs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "messages"));

    return () => unsubscribeMessages();
  }, [isLoggedIn, currentUser, selectedRoom, privateChatWith]);

  useEffect(() => {
    if (callAccepted && !callEnded) {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (!callAccepted) setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callAccepted, callEnded]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resetCallState = () => {
    setCallEnded(true);
    isCallActiveRef.current = false;
    setIsMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
    setCallDuration(0);
    
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      setStream(null);
    }

    setRemoteStream(null);
    setReceivingCall(false);
    setCallAccepted(false);
    setIsCalling(false);
    setCaller("");
    setCallerSignal(null);
    setIdToCall("");
    setName("");
    
    setTimeout(() => setCallEnded(false), 2000);
  };

  // Socket listeners (Signaling only)
  useEffect(() => {
    if (!socket) return;

    socket.on("user-list", (userList: User[]) => {
      setUsers((prev) => {
        // Only notify if it's not the initial load
        if (prev.length > 0) {
          if (userList.length > prev.length) {
            const newUser = userList.find(u => !prev.some(p => p.id === u.id));
            if (newUser && newUser.id !== socket.id) {
              showNotification(`${newUser.name} entrou na sala`, {
                body: "Um novo usuário se juntou à conversa.",
                icon: "/favicon.ico"
              });
            }
          } else if (userList.length < prev.length) {
            const leftUser = prev.find(p => !userList.some(u => u.id === p.id));
            if (leftUser && leftUser.id !== socket.id) {
              showNotification(`${leftUser.name} saiu da sala`, {
                body: "Um usuário deixou a conversa.",
                icon: "/favicon.ico"
              });
            }
          }
        }
        return userList;
      });
    });

    socket.on("user-typing", ({ userName, isTyping }: { userId: string; userName: string; isTyping: boolean }) => {
      setTypingUsers((prev) => {
        if (isTyping) {
          if (prev.includes(userName)) return prev;
          return [...prev, userName];
        } else {
          return prev.filter((name) => name !== userName);
        }
      });
    });

    socket.on("notification", (notif: Notification) => {
      setNotifications((prev) => [...prev, notif]);
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      }, 3000);
    });

    socket.on("call-made", (data) => {
      setReceivingCall(true);
      setCaller(data.from);
      setName(data.name);
      setCallerSignal(data.signal);
      setCallType(data.callType || "video");
      
      showNotification(`Chamada de ${data.name}`, {
        body: `Você está recebendo uma chamada de ${data.callType === "video" ? "vídeo" : "voz"}.`,
        icon: "/favicon.ico"
      });
    });

    socket.on("call-ended", () => {
      showNotification("Chamada Encerrada", {
        body: "A chamada foi finalizada.",
        icon: "/favicon.ico"
      });
      resetCallState();
    });

    return () => {
      socket.off("user-list");
      socket.off("user-typing");
      socket.off("notification");
      socket.off("call-made");
      socket.off("call-ended");
    };
  }, [socket]);

  useEffect(() => {
    if (stream && myVideo.current) {
      myVideo.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (remoteStream && userVideo.current) {
      userVideo.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const callUser = (id: string, type: "video" | "voice") => {
    console.log("Initiating call to:", id, "type:", type);
    setCallType(type);
    setIsCalling(true);
    setIdToCall(id);
    isCallActiveRef.current = true;
    
    navigator.mediaDevices.getUserMedia({ video: type === "video", audio: true })
      .then((currentStream) => {
        if (!isCallActiveRef.current) {
          currentStream.getTracks().forEach(track => track.stop());
          return;
        }
        setStream(currentStream);

        // Handle Peer constructor variations in ESM/Vite
        const PeerConstructor = (Peer as any).default || Peer;
        if (typeof PeerConstructor !== 'function') {
          console.error("Peer constructor is not a function:", PeerConstructor);
          throw new Error("WebRTC library not loaded correctly");
        }

        const peer = new PeerConstructor({
          initiator: true,
          trickle: false,
          stream: currentStream,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        peer.on("signal", (data: any) => {
          console.log("Generated call signal");
          socket?.emit("call-user", {
            userToCall: id,
            signalData: data,
            from: socket.id,
            name: username,
            callType: type,
          });
        });

        peer.on("stream", (remoteStream: any) => {
          console.log("Received remote stream");
          setRemoteStream(remoteStream);
        });

        peer.on("error", (err: any) => {
          console.error("Peer error:", err);
          leaveCall();
        });

        socket?.once("call-accepted", (signal) => {
          console.log("Call accepted by remote user");
          showNotification("Chamada Aceita", {
            body: "A outra pessoa atendeu a chamada.",
            icon: "/favicon.ico"
          });
          if (peer && !peer.destroyed && isCallActiveRef.current) {
            setCallAccepted(true);
            peer.signal(signal);
          } else {
            console.log("Peer already destroyed or call inactive, ignoring call-accepted");
            if (peer && !peer.destroyed) peer.destroy();
          }
        });

        if (isCallActiveRef.current) {
          connectionRef.current = peer;
        } else {
          peer.destroy();
        }
      })
      .catch((err) => {
        console.error("Permission or Media error:", err);
        resetCallState();
        const errorMsg = err.name === "NotAllowedError" 
          ? "Permission denied for camera/microphone" 
          : "Could not access camera/microphone. Please check your settings.";
        
        setNotifications((prev) => [...prev, {
          id: Date.now().toString(),
          text: errorMsg,
          type: "error"
        }]);
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.text !== errorMsg));
        }, 3000);
      });
  };

  const answerCall = () => {
    console.log("Answering call from:", caller);
    setCallAccepted(true);
    isCallActiveRef.current = true;
    navigator.mediaDevices.getUserMedia({ video: callType === "video", audio: true })
      .then((currentStream) => {
        if (!isCallActiveRef.current) {
          currentStream.getTracks().forEach(track => track.stop());
          return;
        }
        setStream(currentStream);

        const PeerConstructor = (Peer as any).default || Peer;
        if (typeof PeerConstructor !== 'function') {
          console.error("Peer constructor is not a function:", PeerConstructor);
          throw new Error("WebRTC library not loaded correctly");
        }
        const peer = new PeerConstructor({
          initiator: false,
          trickle: false,
          stream: currentStream,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        peer.on("signal", (data: any) => {
          console.log("Generated answer signal");
          socket?.emit("answer-call", { signal: data, to: caller });
        });

        peer.on("stream", (remoteStream: any) => {
          console.log("Received remote stream (answer)");
          setRemoteStream(remoteStream);
        });

        peer.on("error", (err: any) => {
          console.error("Peer error (answer):", err);
          leaveCall();
        });

        if (peer && !peer.destroyed && isCallActiveRef.current) {
          peer.signal(callerSignal);
        } else {
          console.log("Peer already destroyed or call inactive, ignoring answer signal");
          if (peer && !peer.destroyed) peer.destroy();
        }
        
        if (isCallActiveRef.current) {
          connectionRef.current = peer;
        } else {
          if (peer && !peer.destroyed) peer.destroy();
        }
      })
      .catch((err) => {
        console.error("Permission or Media error (answer):", err);
        resetCallState();
        setNotifications((prev) => [...prev, {
          id: Date.now().toString(),
          text: "Permission denied for camera/microphone",
          type: "error"
        }]);
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.text !== "Permission denied for camera/microphone"));
        }, 3000);
      });
  };

  const leaveCall = () => {
    socket?.emit("end-call", { to: caller || idToCall });
    resetCallState();
  };

  const toggleMute = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (stream && callType === "video") {
      stream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (connectionRef.current && stream) {
          const videoTrack = stream.getVideoTracks()[0];
          connectionRef.current.replaceTrack(videoTrack, screenTrack, stream);
        }
        
        if (myVideo.current) {
          myVideo.current.srcObject = screenStream;
        }
        
        screenTrack.onended = () => {
          stopScreenShare();
        };
        
        setIsScreenSharing(true);
      } catch (err) {
        console.error("Error sharing screen:", err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (stream && myVideo.current) {
      const videoTrack = stream.getVideoTracks()[0];
      
      if (screenStreamRef.current) {
        const screenTrack = screenStreamRef.current.getVideoTracks()[0];
        
        if (connectionRef.current && screenTrack) {
          connectionRef.current.replaceTrack(screenTrack, videoTrack, stream);
        }
        
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      
      myVideo.current.srcObject = stream;
      setIsScreenSharing(false);
    }
  };

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Save user to Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: user.displayName || username || "Anonymous",
        color: selectedColor,
        lastSeen: new Date().toISOString()
      });
      
      setIsLoggedIn(true);
      requestNotificationPermission();
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request') {
        console.log("Login popup request was cancelled due to multiple requests.");
        return;
      }
      console.error("Login error:", error);
      setNotifications((prev) => [...prev, {
        id: Date.now().toString(),
        text: "Login failed. Please try again.",
        type: "error"
      }]);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentUser) return;

    let roomId = selectedRoom;
    let recipientId = null;

    if (privateChatWith) {
      const ids = [currentUser.uid, privateChatWith.id].sort();
      roomId = `private_${ids[0]}_${ids[1]}`;
      recipientId = privateChatWith.id;
    }

    const messageData = {
      text: inputText,
      senderId: currentUser.uid,
      senderName: username,
      senderColor: selectedColor,
      roomId: roomId,
      timestamp: serverTimestamp(),
      ...(recipientId && { to: recipientId })
    };

    try {
      await addDoc(collection(db, "messages"), messageData);
      setInputText("");
      
      // Emit typing false via socket
      socket?.emit("typing", false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "messages");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    if (!socket) return;

    // Emit typing
    socket.emit("typing", true);

    // Debounce stop typing
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", false);
    }, 2000);
  };

  const handleRoomChange = (room: string) => {
    if (room === selectedRoom && !privateChatWith) return;
    setPrivateChatWith(null);
    setSelectedRoom(room);
    if (socket) {
      socket.emit("join-room", { name: username, room, color: selectedColor, uid: currentUser?.uid });
    }
    setIsSidebarOpen(false);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim() || !currentUser) return;
    
    try {
      const roomName = newRoomName.trim();
      await addDoc(collection(db, "rooms"), {
        name: roomName,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
      setNewRoomName("");
      setShowRoomCreator(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "rooms");
    }
  };

  const startPrivateChat = (user: User) => {
    if (user.id === currentUser?.uid) return;
    setPrivateChatWith(user);
    setIsSidebarOpen(false);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    if (socket) {
      socket.emit("join-room", { name: username, room: selectedRoom, color: selectedColor, uid: currentUser?.uid });
    }
    setShowSettings(false);
    setNotifications((prev) => [...prev, {
      id: Date.now().toString(),
      text: "Profile updated successfully!",
      type: "success"
    }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.text !== "Profile updated successfully!"));
    }, 3000);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">Loading CollabChat...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 relative overflow-hidden">
        {/* Background blobs for modern look */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-200/30 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-300/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md glass rounded-[2.5rem] shadow-2xl p-8 md:p-10 relative z-10"
        >
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-brand-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-brand-200 animate-float">
              <MessageSquare className="text-white w-8 h-8 md:w-10 md:h-10" />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">CollabChat</h1>
            <p className="text-sm md:text-base text-slate-500 mt-3 text-center font-medium">The ultimate workspace for real-time collaboration</p>
          </div>

          <div className="space-y-8">
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className={`w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-3 text-base active:scale-[0.98] ${isLoggingIn ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoggingIn ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              {isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-widest"><span className="bg-white/50 backdrop-blur-sm px-3 text-slate-400">Customize your profile</span></div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">Choose your vibe</label>
                <div className="flex flex-wrap gap-3 justify-center">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl transition-all duration-300 ${selectedColor === color ? 'ring-4 ring-brand-100 scale-110 shadow-lg' : 'hover:scale-105 opacity-80 hover:opacity-100'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="pt-4 text-center">
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Secure • Real-time • Persistent</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden font-sans relative">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div 
        className={`fixed inset-y-0 left-0 w-80 bg-white border-r border-slate-200 flex flex-col z-50 md:relative md:translate-x-0 transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-8 flex flex-col h-full">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center shadow-xl shadow-brand-100">
                <MessageSquare className="text-white w-6 h-6" />
              </div>
              <span className="text-2xl font-extrabold text-slate-900 tracking-tight">CollabChat</span>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide space-y-8">
            {/* Notification Permission Button */}
            {notificationPermission !== "granted" && (
              <div className="px-2">
                <button
                  onClick={notificationPermission === "default" ? requestNotificationPermission : undefined}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all ${
                    notificationPermission === "denied" 
                      ? 'bg-red-50 text-red-600 cursor-default' 
                      : 'bg-brand-50 text-brand-600 hover:bg-brand-100'
                  }`}
                  title={notificationPermission === "denied" ? "Por favor, habilite as notificações nas configurações do seu navegador." : "Clique para receber alertas de chamadas e mensagens."}
                >
                  {notificationPermission === "denied" ? (
                    <>
                      <BellOff className="w-4 h-4" />
                      Notificações Bloqueadas
                    </>
                  ) : (
                    <>
                      <Bell className="w-4 h-4" />
                      Ativar Notificações
                    </>
                  )}
                </button>
              </div>
            )}

            <div>
              <div className="flex-1 overflow-y-auto scrollbar-hide space-y-8">
                <div>
                  <div className="flex items-center justify-between mb-4 px-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Channels</p>
                    <button 
                      onClick={() => setShowRoomCreator(!showRoomCreator)}
                      className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {showRoomCreator && (
                    <motion.form 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onSubmit={handleCreateRoom} 
                      className="px-2 mb-6"
                    >
                      <input
                        autoFocus
                        type="text"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="Create new channel..."
                        className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                      />
                    </motion.form>
                  )}

                  <div className="space-y-1">
                    {availableRooms.map((room) => {
                      const usersInRoom = globalUsers.filter(u => u.room === room.name);
                      return (
                        <div key={room.id} className="space-y-1">
                          <button
                            onClick={() => handleRoomChange(room.name)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold transition-all group ${
                              selectedRoom === room.name && !privateChatWith
                                ? 'bg-brand-600 text-white shadow-lg shadow-brand-100' 
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Hash className={`w-4 h-4 ${selectedRoom === room.name && !privateChatWith ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
                              {room.name}
                            </div>
                            {usersInRoom.length > 0 && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${selectedRoom === room.name && !privateChatWith ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                {usersInRoom.length}
                              </span>
                            )}
                          </button>
                          
                          {selectedRoom === room.name && !privateChatWith && usersInRoom.length > 0 && (
                            <div className="ml-9 space-y-2 py-2">
                              {usersInRoom.map(u => (
                                <div key={u.uid} className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                  <span className="text-xs font-medium text-slate-400">{u.name} {u.uid === currentUser?.uid && '(You)'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 px-2">Direct Messages</p>
              <div className="space-y-1">
                {globalUsers.filter(u => u.uid !== currentUser?.uid).map((user) => (
                  <button
                    key={user.uid}
                    onClick={() => startPrivateChat({ id: user.uid, uid: user.uid, name: user.name, color: user.color, room: "private" })}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all group ${
                      privateChatWith?.id === user.uid
                        ? 'bg-brand-600 text-white shadow-lg shadow-brand-100' 
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="relative">
                      <div 
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold transition-transform group-hover:scale-110 ${privateChatWith?.id === user.uid ? 'bg-white/20' : ''}`}
                        style={{ backgroundColor: privateChatWith?.id === user.uid ? undefined : user.color }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                    </div>
                    <span className="truncate">{user.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-100">
            <div className="bg-slate-50 rounded-3xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold shadow-lg"
                  style={{ backgroundColor: selectedColor }}
                >
                  {username.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900 truncate max-w-[100px]">{username}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Online</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all rounded-xl"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white md:bg-slate-50 w-full relative">
        {/* Header */}
        <header className="h-20 md:h-24 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 md:px-10 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2.5 text-slate-500 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="hidden sm:flex md:hidden w-12 h-12 bg-brand-600 rounded-2xl items-center justify-center shadow-lg shadow-brand-100">
              <MessageSquare className="text-white w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                  {privateChatWith ? (
                    <UserIcon className="w-4 h-4 md:w-5 md:h-5 text-slate-500" />
                  ) : (
                    <Hash className="w-4 h-4 md:w-5 md:h-5 text-slate-500" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-extrabold text-slate-900 tracking-tight">
                    {privateChatWith ? privateChatWith.name : selectedRoom}
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                    <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-widest">
                      {privateChatWith ? 'Active now' : `${users.length} members online`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {privateChatWith && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => callUser(privateChatWith.id, "voice")}
                  className="p-3 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-2xl transition-all active:scale-95"
                  title="Voice Call"
                >
                  <Phone className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => callUser(privateChatWith.id, "video")}
                  className="p-3 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-2xl transition-all active:scale-95"
                  title="Video Call"
                >
                  <Video className="w-5 h-5" />
                </button>
              </div>
            )}
            <div className="hidden lg:flex items-center bg-slate-100 rounded-2xl px-4 py-2.5 gap-3 border border-transparent focus-within:border-brand-500 focus-within:bg-white transition-all">
              <Search className="w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search conversation..." className="bg-transparent text-sm font-medium outline-none w-48" />
            </div>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-3 text-slate-500 hover:bg-slate-100 rounded-2xl transition-all"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 scrollbar-hide">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-10">
              <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mb-6 border border-slate-100">
                <MessageSquare className="w-10 h-10 text-slate-200" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 mb-2">No messages yet</h3>
              <p className="text-slate-400 text-sm max-w-xs font-medium">
                Be the first one to start the conversation in <span className="text-brand-600 font-bold">#{selectedRoom.toLowerCase()}</span>
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => {
                const isMe = msg.senderId === currentUser?.uid;
                const showAvatar = idx === 0 || messages[idx - 1].senderId !== msg.senderId;
                
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`flex items-end gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      {!isMe && showAvatar && (
                        <div 
                          className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-lg mb-1"
                          style={{ backgroundColor: msg.senderColor }}
                        >
                          {msg.senderName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {!isMe && !showAvatar && <div className="w-10" />}
                      
                      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        {showAvatar && (
                          <div className={`flex items-center gap-2 mb-2 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                            <span className="text-xs font-bold text-slate-900">{isMe ? 'You' : msg.senderName}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                        <div className={`chat-bubble ${isMe ? 'chat-bubble-me' : 'chat-bubble-other'}`}>
                          <p className="font-medium">{msg.text}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing Indicator */}
        <div className="px-4 md:px-8 h-6">
          <AnimatePresence>
            {typingUsers.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="flex items-center gap-2 text-[10px] md:text-xs text-slate-400 font-medium"
              >
                <div className="flex gap-1">
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 h-1 bg-slate-400 rounded-full" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-slate-400 rounded-full" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-slate-400 rounded-full" />
                </div>
                {typingUsers.length === 1 
                  ? `${typingUsers[0]} is typing...` 
                  : `${typingUsers.length} people are typing...`}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="p-6 md:p-10 pt-2">
          <form 
            onSubmit={handleSendMessage}
            className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-100 p-2 md:p-3 flex items-center gap-2 md:gap-3 focus-within:ring-4 focus-within:ring-brand-500/10 focus-within:border-brand-500 transition-all"
          >
            <button type="button" className="p-3 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-2xl transition-all">
              <Smile className="w-6 h-6" />
            </button>
            <input
              type="text"
              value={inputText}
              onChange={handleInputChange}
              placeholder={`Write something to ${privateChatWith ? privateChatWith.name : '#' + selectedRoom.toLowerCase()}...`}
              className="flex-1 py-3 px-2 text-base font-medium outline-none bg-transparent placeholder:text-slate-300"
            />
            <button 
              type="submit"
              disabled={!inputText.trim()}
              className={`p-3.5 md:p-4 rounded-[1.25rem] transition-all active:scale-95 ${
                inputText.trim() 
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-200 hover:bg-brand-700' 
                  : 'bg-slate-100 text-slate-300'
              }`}
            >
              <Send className="w-6 h-6" />
            </button>
          </form>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-10 relative"
            >
              <button 
                onClick={() => setShowSettings(false)}
                className="absolute top-6 right-6 p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="mb-8">
                <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">User Settings</h3>
                <p className="text-sm text-slate-500 font-medium">Personalize your chat experience</p>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-8">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">Display Name</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-5 py-4 text-base border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all font-medium"
                      placeholder="Enter your name..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">Theme Color</label>
                    <div className="flex flex-wrap gap-3">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setSelectedColor(color)}
                          className={`w-10 h-10 rounded-xl transition-all duration-300 ${selectedColor === color ? 'ring-4 ring-brand-100 scale-110 shadow-lg' : 'hover:scale-105 opacity-80 hover:opacity-100'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-brand-200 transition-all active:scale-[0.98]"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Call UI */}
      <AnimatePresence>
        {(isCalling || receivingCall) && !callEnded && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-between p-4 md:p-10 overflow-hidden"
          >
            {/* Background blur effect */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
              <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-500 rounded-full blur-[150px] animate-pulse" />
              <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-600 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
            </div>

            <div className="w-full max-w-6xl flex-1 flex flex-col gap-6 relative z-10">
              <div className="flex items-center justify-between px-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/10">
                    <Video className="text-white w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-white tracking-tight">
                      {callAccepted ? `In call with ${name || privateChatWith?.name}` : receivingCall ? `Incoming ${callType} call` : `Calling ${name || privateChatWith?.name}...`}
                    </h3>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                      {callAccepted ? formatTime(callDuration) : 'Connecting...'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 relative min-h-0">
                {/* Remote Video (Full Screen) */}
                <div className="absolute inset-0 bg-slate-900 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl">
                  {callAccepted && !callEnded ? (
                    <>
                      <video 
                        playsInline 
                        ref={userVideo} 
                        autoPlay 
                        className={`w-full h-full object-cover transition-opacity duration-500 ${callType === "voice" ? "opacity-0" : "opacity-100"}`} 
                      />
                      {callType === "voice" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-slate-900">
                          <div className="w-32 h-32 bg-slate-800 rounded-[2.5rem] flex items-center justify-center text-5xl font-extrabold text-white shadow-2xl">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div className="text-center">
                            <span className="text-white font-bold text-lg block mb-1">{name}</span>
                            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Voice Only</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-slate-900">
                      <div className="relative">
                        <div className="w-32 h-32 bg-slate-800 rounded-[2.5rem] flex items-center justify-center text-5xl font-extrabold text-white animate-pulse">
                          {(name || privateChatWith?.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="absolute -inset-4 border-2 border-brand-500/30 rounded-[3rem] animate-ping" />
                      </div>
                      <div className="text-center">
                        <h3 className="text-2xl font-extrabold text-white mb-2 tracking-tight">{name || privateChatWith?.name}</h3>
                        <p className="text-brand-400 text-xs font-bold uppercase tracking-[0.2em] animate-pulse">
                          {receivingCall && !callAccepted ? "Incoming call..." : "Calling..."}
                        </p>
                      </div>
                    </div>
                  )}
                  {callAccepted && (
                    <div className="absolute bottom-6 left-6 glass px-4 py-2 rounded-xl text-white text-xs font-bold border border-white/10 z-20">
                      {name || privateChatWith?.name}
                    </div>
                  )}
                </div>

                {/* Local Video (Floating) */}
                <motion.div 
                  drag
                  dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                  className="absolute top-6 right-6 w-32 h-48 md:w-48 md:h-64 bg-slate-800 rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl z-30 cursor-move"
                >
                  <video 
                    playsInline 
                    muted 
                    ref={myVideo} 
                    autoPlay 
                    className={`w-full h-full object-cover transition-opacity duration-500 ${callType === "voice" || isVideoOff ? "opacity-0" : "opacity-100"}`} 
                  />
                  {(callType === "voice" || isVideoOff) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-800">
                      <div className="w-12 h-12 md:w-16 md:h-16 bg-brand-600 rounded-2xl flex items-center justify-center text-xl md:text-2xl font-extrabold text-white">
                        {username.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">You</span>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg text-white text-[10px] font-bold">
                    You {isMuted && '• Muted'}
                  </div>
                </motion.div>
              </div>

              {/* Controls */}
              <div className="h-24 md:h-32 flex items-center justify-center gap-4 md:gap-8">
                {receivingCall && !callAccepted ? (
                  <div className="flex items-center gap-6">
                    <button 
                      onClick={answerCall}
                      className="w-16 h-16 md:w-20 md:h-20 bg-green-500 hover:bg-green-600 text-white rounded-[2rem] flex items-center justify-center shadow-2xl shadow-green-500/40 transition-all hover:scale-110 active:scale-95"
                    >
                      <Phone className="w-8 h-8" />
                    </button>
                    <button 
                      onClick={leaveCall}
                      className="w-16 h-16 md:w-20 md:h-20 bg-red-500 hover:bg-red-600 text-white rounded-[2rem] flex items-center justify-center shadow-2xl shadow-red-500/40 transition-all hover:scale-110 active:scale-95"
                    >
                      <PhoneOff className="w-8 h-8" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 md:gap-6">
                    <button 
                      onClick={toggleMute}
                      className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center transition-all active:scale-95 border ${
                        isMuted 
                          ? 'bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/20' 
                          : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
                      }`}
                      title={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </button>
                    
                    {callType === "video" && (
                      <>
                        <button 
                          onClick={toggleVideo}
                          className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center transition-all active:scale-95 border ${
                            isVideoOff 
                              ? 'bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/20' 
                              : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
                          }`}
                          title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
                        >
                          {isVideoOff ? <Video className="w-6 h-6 opacity-50" /> : <Video className="w-6 h-6" />}
                        </button>

                        <button 
                          onClick={toggleScreenShare}
                          className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center transition-all active:scale-95 border ${
                            isScreenSharing 
                              ? 'bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/20' 
                              : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
                          }`}
                          title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
                        >
                          <Monitor className="w-6 h-6" />
                        </button>
                      </>
                    )}

                    <button 
                      onClick={leaveCall}
                      className="w-16 h-16 md:w-20 md:h-20 bg-red-500 hover:bg-red-600 text-white rounded-[2rem] flex items-center justify-center shadow-2xl shadow-red-500/40 transition-all hover:scale-110 active:scale-95"
                    >
                      <PhoneOff className="w-8 h-8" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notifications Toast */}
      <div className="fixed bottom-20 md:bottom-24 right-4 md:right-8 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className="bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 min-w-[200px]"
            >
              <Circle className="w-2 h-2 fill-blue-500 text-blue-500" />
              <span className="text-sm font-medium">{notif.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppContent />
  );
}
