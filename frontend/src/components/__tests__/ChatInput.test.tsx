import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatInput } from '../chat/ChatInput';

// Mock VoiceInput since it uses browser APIs
vi.mock('../VoiceInput', () => ({
    VoiceInput: ({ disabled }: { disabled: boolean }) => (
        <button disabled={disabled} data-testid="voice-input">Voice</button>
    )
}));

// Mock uploadFile
vi.mock('../../lib/api', () => ({
    uploadFile: vi.fn()
}));

const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    isLoading: false,
    suggestions: [],
    onSuggestionClick: vi.fn()
};

describe('ChatInput', () => {
    it('renders textarea with placeholder', () => {
        render(<ChatInput {...defaultProps} />);
        expect(screen.getByPlaceholderText('ENTER_COMMAND_OR_QUERY...')).toBeInTheDocument();
    });

    it('displays the current value in textarea', () => {
        render(<ChatInput {...defaultProps} value="hello world" />);
        const textarea = screen.getByPlaceholderText('ENTER_COMMAND_OR_QUERY...') as HTMLTextAreaElement;
        expect(textarea.value).toBe('hello world');
    });

    it('calls onChange when user types', () => {
        const onChange = vi.fn();
        render(<ChatInput {...defaultProps} onChange={onChange} />);
        const textarea = screen.getByPlaceholderText('ENTER_COMMAND_OR_QUERY...');
        fireEvent.change(textarea, { target: { value: 'new text' } });
        expect(onChange).toHaveBeenCalledWith('new text');
    });

    it('calls onSend on Enter key (not Shift+Enter)', () => {
        const onSend = vi.fn();
        render(<ChatInput {...defaultProps} value="test" onSend={onSend} />);
        const textarea = screen.getByPlaceholderText('ENTER_COMMAND_OR_QUERY...');
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
        expect(onSend).toHaveBeenCalled();
    });

    it('does NOT call onSend on Shift+Enter', () => {
        const onSend = vi.fn();
        render(<ChatInput {...defaultProps} value="test" onSend={onSend} />);
        const textarea = screen.getByPlaceholderText('ENTER_COMMAND_OR_QUERY...');
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
        expect(onSend).not.toHaveBeenCalled();
    });

    it('disables send button when value is empty', () => {
        render(<ChatInput {...defaultProps} value="" />);
        const sendButton = screen.getByTitle('EXECUTE (ENTER)');
        expect(sendButton).toBeDisabled();
    });

    it('enables send button when value has content', () => {
        render(<ChatInput {...defaultProps} value="hello" />);
        const sendButton = screen.getByTitle('EXECUTE (ENTER)');
        expect(sendButton).not.toBeDisabled();
    });

    it('disables inputs when loading', () => {
        render(<ChatInput {...defaultProps} value="test" isLoading={true} />);
        const textarea = screen.getByPlaceholderText('ENTER_COMMAND_OR_QUERY...') as HTMLTextAreaElement;
        expect(textarea.disabled).toBe(true);
    });

    it('shows suggestions when provided', () => {
        render(
            <ChatInput
                {...defaultProps}
                suggestions={['How does this work?', 'Show me the code']}
            />
        );
        expect(screen.getByText('How does this work?')).toBeInTheDocument();
        expect(screen.getByText('Show me the code')).toBeInTheDocument();
    });

    it('calls onSuggestionClick when suggestion is clicked', () => {
        const onSuggestionClick = vi.fn();
        render(
            <ChatInput
                {...defaultProps}
                suggestions={['suggestion 1']}
                onSuggestionClick={onSuggestionClick}
            />
        );
        fireEvent.click(screen.getByText('suggestion 1'));
        expect(onSuggestionClick).toHaveBeenCalledWith('suggestion 1');
    });

    it('shows char count only above 100 characters', () => {
        const shortText = 'hi';
        const { rerender } = render(<ChatInput {...defaultProps} value={shortText} />);
        expect(screen.queryByText(shortText.length.toLocaleString())).not.toBeInTheDocument();

        const longText = 'a'.repeat(150);
        rerender(<ChatInput {...defaultProps} value={longText} />);
        expect(screen.getByText('150')).toBeInTheDocument();
    });
});
