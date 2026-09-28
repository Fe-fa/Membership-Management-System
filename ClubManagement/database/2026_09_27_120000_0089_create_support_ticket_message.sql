-- Baseline schema for dbo.Support_ticket_message. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Support_ticket_message', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Support_ticket_message] (
        [support_ticket_message_id] bigint IDENTITY(1,1) NOT NULL,
        [support_ticket_id] bigint NOT NULL,
        [author_user_id] bigint NOT NULL,
        [author_name] nvarchar(200) NOT NULL,
        [body] nvarchar(MAX) NOT NULL,
        [is_staff] bit NOT NULL CONSTRAINT [DF_support_msg_staff] DEFAULT ((0)),
        [created_at] datetime2(7) NOT NULL,
        CONSTRAINT [PK__Support___7CCB0CD6A8D29E07] PRIMARY KEY ([support_ticket_message_id])
    );
END
GO
