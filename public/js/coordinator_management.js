// public/js/coordinator_management.js
function removeCoordinator(email, button) {
    // Prompt for confirmation before deletion
    if (confirm(`Are you sure you want to remove the coordinator with email: ${email}?`)) {
        // Send DELETE request to the server
        fetch(`/coordinators/remove/${encodeURIComponent(email)}`, {
            method: 'DELETE',
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Remove the table row if deletion is successful
                const row = button.closest('tr');
                row.remove();
            } else {
                // Display error message from server
                alert(data.message);
            }
        })
        .catch(error => {
            // Handle network or unexpected errors
            console.error('Error:', error);
            alert('An error occurred while removing the coordinator.');
        });
    }
}