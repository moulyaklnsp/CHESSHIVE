// public/js/tournament_management.js
function removeTournament(tournamentId, button) {
    // Prompt for confirmation before deletion
    if (confirm(`Are you sure you want to remove the tournament with ID: ${tournamentId}?`)) {
        try {
            // Create a hidden form
            const form = document.createElement('form');
            form.method = 'POST'; // Use POST with method override
            form.action = `/tournaments/remove/${encodeURIComponent(tournamentId)}?_method=DELETE`;
            document.body.appendChild(form);
            form.submit();
        } catch (error) {
            console.error('Error submitting form:', error);
            alert('Failed to initiate tournament removal. Please try again.');
        }
    }
}