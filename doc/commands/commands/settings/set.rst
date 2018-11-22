###################
Settings (set)
###################

Name
==================

lowsync-settings-set - Set settings of the device

Synopsis
==================

.. code-block:: bash

    lowsync settings set <key-value-pairs..>

Description
==================

Set one or more settings.

Options
==================

.. code-block:: bash

    key-value-pairs..

The syntax of a key/value pair must be in the form *key=value*. If the value is a string and contains spaces, it must be enclosed in double quotes (:code:`"`). Multiple key/value pairs may be given. Separate multiple key/value pairs with spaces.

Examples
==================

.. code-block:: bash

    lowsync settings set example.setting="an example"

Sets the setting *example.setting* to *an example*.