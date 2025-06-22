// public/js/coordinator_management.js
function removeCoordinator(email, button) {
    // Prompt for confirmation before deletion
    if (confirm(`Are you sure you want to remove the coordinator with email: ${email}?`)) {
        try {
            // Create a hidden form
            const form = document.createElement('form');
            form.method = 'POST'; // Use POST with method override
            form.action = `/coordinators/remove/${encodeURIComponent(email)}?_method=DELETE`;
            document.body.appendChild(form);
            form.submit();
        } catch (error) {
            console.error('Error submitting form:', error);
            alert('Failed to initiate coordinator removal. Please try again.');
        }
    }
}