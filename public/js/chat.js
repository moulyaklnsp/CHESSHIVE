const socket = io();

        let username = "";
        let role = "";

        function joinChat() {
            username = document.getElementById("username").value.trim();
            role = document.getElementById("userRole").value;

            if (username === "") return alert("Enter your name");

            socket.emit("join", { username, role });
        }

        // Update user list when someone joins or leaves
        socket.on("updateUsers", (users) => {
            let userList = document.getElementById("userList");
            userList.innerHTML = '<option value="All">Global Chat</option>';
            users.forEach((user) => {
                if (user.username !== username) {
                    let option = document.createElement("option");
                    option.value = user.username;
                    option.textContent = user.username;
                    userList.appendChild(option);
                }
            });
        });

        function sendMessage() {
            let message = document.getElementById("chatMessage").value.trim();
            let receiver = document.getElementById("userList").value;

            if (message === "") return;

            // Display sent message in chat box
            let chatBox = document.getElementById("chatBox");
            let msgDiv = document.createElement("div");
            msgDiv.classList.add("message", "sent");
            msgDiv.innerHTML = `<p><strong>You:</strong> ${message}</p>`;
            chatBox.appendChild(msgDiv);

            socket.emit("chatMessage", { sender: username, receiver, message });
            document.getElementById("chatMessage").value = "";
        }

        socket.on("message", ({ sender, message }) => {
            let chatBox = document.getElementById("chatBox");
            let msgDiv = document.createElement("div");
            msgDiv.classList.add("message", "received");
            msgDiv.innerHTML = `<p><strong>${sender}:</strong> ${message}</p>`;
            chatBox.appendChild(msgDiv);
        });