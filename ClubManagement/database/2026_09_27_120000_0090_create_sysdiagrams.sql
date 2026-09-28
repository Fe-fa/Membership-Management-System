-- Baseline schema for dbo.sysdiagrams. This file is not executed by the application.
IF OBJECT_ID(N'dbo.sysdiagrams', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[sysdiagrams] (
        [name] sysname NOT NULL,
        [principal_id] int NOT NULL,
        [diagram_id] int IDENTITY(1,1) NOT NULL,
        [version] int NULL,
        [definition] varbinary(MAX) NULL,
        CONSTRAINT [PK__sysdiagr__C2B05B61DB74B991] PRIMARY KEY ([diagram_id])
    );
END
GO
