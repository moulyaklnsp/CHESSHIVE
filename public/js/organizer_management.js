// public/js/organizer_management.js
function removeOrganizer(email, button) {
    // Prompt for confirmation before deletion
    if (confirm(`Are you sure you want to remove the organizer with email: ${email}?`)) {
        // Create a hidden form
        const form = document.createElement('form');
        form.method = 'POST'; // Use POST with method override
        form.action = `/organizers/remove/${encodeURIComponent(email)}?_method=DELETE`;

        // Append form to body and submit
        document.body.appendChild(form);
        form.submit();
    }
}