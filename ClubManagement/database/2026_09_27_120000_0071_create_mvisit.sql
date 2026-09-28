-- Baseline schema for dbo.MVisit. This file is not executed by the application.
IF OBJECT_ID(N'dbo.MVisit', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MVisit] (
        [visit_id] bigint IDENTITY(1,1) NOT NULL,
        [guest_id] bigint NOT NULL,
        [visiting_profile_id] bigint NOT NULL,
        [visit_date] date NOT NULL,
        [time_in] time(7) NULL,
        [time_out] time(7) NULL,
        [guest_book_entry_no] nvarchar(50) NULL,
        [is_current_flag] bit NOT NULL CONSTRAINT [DF__MVisit__is_curre__79FD19BE] DEFAULT ((0)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__MVisit__created___7AF13DF7] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [notes] nvarchar(500) NULL,
        [purpose] nvarchar(80) NULL,
        [signature] nvarchar(MAX) NULL,
        CONSTRAINT [PK_MVisit] PRIMARY KEY ([visit_id])
    );
END
GO
